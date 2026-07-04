/**
 * Auth HTTP handlers — SMS code send, verify, session, logout,
 * anonymous login, and phone binding.
 *
 * Follows the same pattern as cloudAsr.ts: imports from '../utils' and
 * uses createCorsResponse / createSuccessResponse / createErrorResponse.
 * Auth routes are direct-matched in index.ts (no API_KEY guard).
 *
 * Exports:
 *   handleSendCode      — POST /api/auth/send-code
 *   handleVerifyCode    — POST /api/auth/verify-code
 *   handleSession       — GET /api/auth/session
 *   handleLogout        — POST /api/auth/logout
 *   handleAnonymous     — POST /api/auth/anonymous
 *   handleBindPhone     — POST /api/auth/bind-phone
 */

import { AuthService } from "../services/AuthService";
import { createCorsResponse, createErrorResponse, createSuccessResponse } from "../utils";
import { parseAuthCookie, setTokenCookie } from "../utils/cookie";
import { getStorageAdapter } from "../db/client";
import type { Env } from "../types/env";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract client IP from CF-Connecting-IP header, falling back to an empty string. */
function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") || "";
}

/** Build an AuthService from env for the handler chain. */
function makeAuth(env: Env): AuthService {
  return new AuthService(
    getStorageAdapter(env),
    env.JWT_SECRET || "dev-secret",
  );
}

/** Build the SMS config object from env for sendCode calls. */
function smsConfig(env: Env) {
  return {
    ALIBABA_ACCESS_KEY_ID: env.ALIBABA_ACCESS_KEY_ID,
    ALIBABA_ACCESS_KEY_SECRET: env.ALIBABA_ACCESS_KEY_SECRET,
    ALIBABA_SMS_SIGN_NAME: env.ALIBABA_SMS_SIGN_NAME,
    ALIBABA_SMS_TEMPLATE_CODE: env.ALIBABA_SMS_TEMPLATE_CODE,
  };
}

/**
 * Map a thrown error (which may carry a numeric `status` property) to an
 * appropriate HTTP status code.  Falls back to 500 for unrecognised errors.
 */
function errorStatus(err: unknown): number {
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status: unknown }).status;
    if (typeof s === "number") return s;
  }
  return 500;
}

// ---------------------------------------------------------------------------
// Crypto helpers (replicated from AuthService for handler-local use)
// ---------------------------------------------------------------------------

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function signJWT(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds: number,
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds };

  const encoder = new TextEncoder();
  const headerB64 = b64url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = b64url(encoder.encode(JSON.stringify(fullPayload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));
  const sigB64 = b64url(new Uint8Array(sig));

  return `${signingInput}.${sigB64}`;
}

async function verifyJWT(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const encoder = new TextEncoder();
    const signingInput = `${parts[0]}.${parts[1]}`;

    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));
    const sigB64 = b64url(new Uint8Array(sig));

    if (sigB64 !== parts[2]) return null;

    const payloadJson = new TextDecoder().decode(fromB64url(parts[1]));
    const payload = JSON.parse(payloadJson);

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

function b64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromB64url(str: string): Uint8Array {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/send-code
 *
 * Accepts { phone: string }, validates format, applies rate limits, and
 * sends a 6-digit verification code via SMS.
 */
export async function handleSendCode(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return createCorsResponse(createErrorResponse("Method not allowed"), 405);
  }

  let body: { phone?: string };
  try {
    body = (await request.json()) as { phone?: string };
  } catch {
    return createCorsResponse(createErrorResponse("请求体必须是 JSON"), 400);
  }

  const phone = (body.phone || "").trim();
  if (!phone) {
    return createCorsResponse(createErrorResponse("手机号不能为空"), 400);
  }

  const ip = clientIp(request);

  try {
    const auth = makeAuth(env);
    await auth.sendCode(phone, ip, smsConfig(env));
  } catch (err) {
    const status = errorStatus(err);

    if (status === 429) {
      const retryAfter = (err && typeof err === "object" && "retryAfter" in err)
        ? (err as { retryAfter: number }).retryAfter
        : 60;
      return new Response(
        JSON.stringify({ ok: false, error: (err as Error).message }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Retry-After": String(retryAfter),
          },
        },
      );
    }

    const message = err instanceof Error ? err.message : "发送失败";
    console.log("[auth] sendCode error", { phone: "***", ip, error: message });
    return createCorsResponse(createErrorResponse(message), status);
  }

  return createCorsResponse(createSuccessResponse({ ok: true }), 200);
}

/**
 * POST /api/auth/verify-code
 *
 * Accepts { phone, code }, verifies against the stored code, creates/finds
 * the user, and returns a JWT in a Set-Cookie header.
 */
export async function handleVerifyCode(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return createCorsResponse(createErrorResponse("Method not allowed"), 405);
  }

  let body: { phone?: string; code?: string };
  try {
    body = (await request.json()) as { phone?: string; code?: string };
  } catch {
    return createCorsResponse(createErrorResponse("请求体必须是 JSON"), 400);
  }

  const phone = (body.phone || "").trim();
  const code = (body.code || "").trim();

  if (!phone || !code) {
    return createCorsResponse(createErrorResponse("手机号和验证码不能为空"), 400);
  }

  try {
    const auth = makeAuth(env);
    const { userId, token } = await auth.verifyCode(phone, code);

    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Set-Cookie", setTokenCookie(token, 604800));

    return new Response(
      JSON.stringify({ ok: true, userId }),
      { status: 200, headers },
    );
  } catch (err) {
    const status = errorStatus(err);
    const message = err instanceof Error ? err.message : "验证失败";
    console.log("[auth] verifyCode error", { phone: "***", status, error: message });
    return createCorsResponse(createErrorResponse(message), status);
  }
}

/**
 * GET /api/auth/session
 *
 * Reads the JWT from the Cookie header, verifies it, and returns the
 * current session.  Never returns 401 — unauthenticated callers get
 * { phone: null, userId: null } (guest mode).
 */
export async function handleSession(request: Request, env: Env): Promise<Response> {
  const token = parseAuthCookie(request);

  if (!token) {
    return createCorsResponse(
      createSuccessResponse({ phone: null, userId: null }),
      200,
    );
  }

  const auth = makeAuth(env);
  const session = await auth.getSession(token);

  if (!session) {
    return createCorsResponse(
      createSuccessResponse({ phone: null, userId: null }),
      200,
    );
  }

  return createCorsResponse(
    createSuccessResponse({ phone: session.phone, userId: session.userId }),
    200,
  );
}

/**
 * POST /api/auth/logout
 *
 * Clears the JWT cookie.  Always succeeds (idempotent).
 */
export async function handleLogout(_request: Request, _env: Env): Promise<Response> {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Set-Cookie", setTokenCookie("", 0));

  return new Response(
    JSON.stringify({ ok: true }),
    { status: 200, headers },
  );
}

/**
 * POST /api/auth/anonymous
 *
 * Creates an anonymous user session from a deviceId.
 * Accepts { deviceId: string }, returns { ok: true, userId } with a
 * 24h JWT cookie.  No API_KEY guard — public endpoint.
 */
export async function handleAnonymous(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return createCorsResponse(createErrorResponse("Method not allowed"), 405);
  }

  let body: { deviceId?: string };
  try {
    body = (await request.json()) as { deviceId?: string };
  } catch {
    return createCorsResponse(createErrorResponse("请求体必须是 JSON"), 400);
  }

  const deviceId = (body.deviceId || "").trim();
  if (!deviceId) {
    return createCorsResponse(createErrorResponse("deviceId 不能为空"), 400);
  }

  try {
    const jwtSecret = env.JWT_SECRET || "dev-secret";
    const adapter = getStorageAdapter(env);

    // Compute userId = "d_" + hex(SHA256(deviceId + JWT_SECRET))
    const userId = "d_" + await sha256Hex(deviceId + jwtSecret);

    // Create anonymous user (no phoneHash)
    await adapter.upsertUser(userId);

    // Sign JWT (HS256, 24h expiry)
    const token = await signJWT(
      { sub: userId, iat: Math.floor(Date.now() / 1000) },
      jwtSecret,
      24 * 3600,
    );

    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Set-Cookie", setTokenCookie(token, 86400));

    console.log("[auth] anonymous login", { userId });
    return new Response(
      JSON.stringify({ ok: true, userId }),
      { status: 200, headers },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "匿名登录失败";
    console.log("[auth] anonymous error", { error: message });
    return createCorsResponse(createErrorResponse(message), 500);
  }
}

/**
 * POST /api/auth/bind-phone
 *
 * Upgrades an anonymous user to a phone-bound user.
 * Requires a valid JWT cookie (anonymous session).
 * Accepts { phone, code }, verifies the code, migrates voices from the
 * old userId to the new phone-derived userId, and returns a new 7d JWT.
 */
export async function handleBindPhone(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return createCorsResponse(createErrorResponse("Method not allowed"), 405);
  }

  // Parse JWT cookie to get the old (anonymous) userId
  const token = parseAuthCookie(request);
  if (!token) {
    return createCorsResponse(createErrorResponse("未登录"), 401);
  }

  const jwtSecret = env.JWT_SECRET || "dev-secret";
  const payload = await verifyJWT(token, jwtSecret);
  if (!payload || !payload.sub) {
    return createCorsResponse(createErrorResponse("登录已过期，请重新登录"), 401);
  }
  const oldUserId = payload.sub as string;

  let body: { phone?: string; code?: string };
  try {
    body = (await request.json()) as { phone?: string; code?: string };
  } catch {
    return createCorsResponse(createErrorResponse("请求体必须是 JSON"), 400);
  }

  const phone = (body.phone || "").trim();
  const code = (body.code || "").trim();

  if (!phone || !code) {
    return createCorsResponse(createErrorResponse("手机号和验证码不能为空"), 400);
  }

  try {
    const adapter = getStorageAdapter(env);

    // Look up the code record
    const row = await adapter.getCode(phone);
    if (!row) {
      return createCorsResponse(createErrorResponse("验证码已过期，请重新获取"), 410);
    }

    // Check expiry (5 min)
    const created = new Date(row.createdAt).getTime();
    if (Date.now() - created > 300_000) {
      await adapter.deleteCode(phone);
      return createCorsResponse(createErrorResponse("验证码已过期，请重新获取"), 410);
    }

    // Check code match
    if (row.code !== code) {
      const attempts = row.attempts;
      if (attempts >= 2) {
        await adapter.deleteCode(phone);
        return createCorsResponse(createErrorResponse("验证码错误次数过多，请重新获取"), 403);
      }
      await adapter.upsertCode(phone, row.code, attempts + 1);
      return createCorsResponse(createErrorResponse("验证码错误"), 403);
    }

    // Code is valid — delete it
    await adapter.deleteCode(phone);

    // Compute new userId = "u_" + SHA256(phone + JWT_SECRET)
    const newUserId = "u_" + await sha256Hex(phone + jwtSecret);

    // Compute phone hash
    const phoneHash = await sha256Hex(phone + jwtSecret);

    // Upsert the phone-bound user
    await adapter.upsertUser(newUserId, phoneHash);

    // Migrate voices from old userId to new userId
    const oldVoices = await adapter.listVoices(oldUserId, 1000, 0);
    for (const v of oldVoices) {
      await adapter.upsertVoice(newUserId, v.voiceId, v.label, v.createdAt);
      await adapter.deleteVoice(oldUserId, v.voiceId);
    }

    // Delete the anonymous user record
    await adapter.deleteUser(oldUserId);

    // Sign new JWT (7d) with the new userId
    const newToken = await signJWT(
      { sub: newUserId, phone: "****" + phone.slice(-4), iat: Math.floor(Date.now() / 1000) },
      jwtSecret,
      7 * 24 * 3600,
    );

    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Set-Cookie", setTokenCookie(newToken, 604800));

    const masked = "****" + phone.slice(-4);
    console.log("[auth] bindPhone success", { oldUserId, newUserId, phone: masked });
    return new Response(
      JSON.stringify({ ok: true, userId: newUserId }),
      { status: 200, headers },
    );
  } catch (err) {
    const status = errorStatus(err);
    const message = err instanceof Error ? err.message : "绑定失败";
    console.log("[auth] bindPhone error", { phone: "***", status, error: message });
    return createCorsResponse(createErrorResponse(message), status);
  }
}
