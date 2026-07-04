/**
 * Auth HTTP handlers — SMS code send, verify, session, logout.
 *
 * Follows the same pattern as cloudAsr.ts: imports from '../utils' and
 * uses createCorsResponse / createSuccessResponse / createErrorResponse.
 * Auth routes are direct-matched in index.ts (no API_KEY guard).
 *
 * Exports:
 *   handleSendCode    — POST /api/auth/send-code
 *   handleVerifyCode  — POST /api/auth/verify-code
 *   handleSession     — GET /api/auth/session
 *   handleLogout      — POST /api/auth/logout
 */

import { AuthService } from '../services/AuthService';
import { createCorsResponse, createErrorResponse, createSuccessResponse } from '../utils';
import type { Env } from '../types/env';

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

/** Parse the `token` value from the request's Cookie header. */
function parseAuthCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith('token=')) {
      const value = trimmed.slice(6);
      // Remove surrounding quotes if present.
      if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
      return value || null;
    }
  }
  return null;
}

/** Build a Set-Cookie header value for the JWT token. */
function setTokenCookie(token: string, maxAge: number): string {
  return `token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=${maxAge}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract client IP from CF-Connecting-IP header, falling back to an empty string. */
function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || '';
}

/**
 * Map a thrown error (which may carry a numeric `status` property) to an
 * appropriate HTTP status code.  Falls back to 500 for unrecognised errors.
 */
function errorStatus(err: unknown): number {
  if (err && typeof err === 'object' && 'status' in err) {
    const s = (err as { status: unknown }).status;
    if (typeof s === 'number') return s;
  }
  return 500;
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
  if (request.method !== 'POST') {
    return createCorsResponse(createErrorResponse('Method not allowed'), 405);
  }

  let body: { phone?: string };
  try {
    body = (await request.json()) as { phone?: string };
  } catch {
    return createCorsResponse(createErrorResponse('请求体必须是 JSON'), 400);
  }

  const phone = (body.phone || '').trim();
  if (!phone) {
    return createCorsResponse(createErrorResponse('手机号不能为空'), 400);
  }

  const ip = clientIp(request);

  try {
    const auth = new AuthService(env);
    await auth.sendCode(phone, ip);
  } catch (err) {
    const status = errorStatus(err);

    if (status === 429) {
      const retryAfter = (err && typeof err === 'object' && 'retryAfter' in err)
        ? (err as { retryAfter: number }).retryAfter
        : 60;
      return new Response(
        JSON.stringify({ ok: false, error: (err as Error).message }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Retry-After': String(retryAfter),
          },
        },
      );
    }

    const message = err instanceof Error ? err.message : '发送失败';
    console.log('[auth] sendCode error', { phone: '***', ip, error: message });
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
  if (request.method !== 'POST') {
    return createCorsResponse(createErrorResponse('Method not allowed'), 405);
  }

  let body: { phone?: string; code?: string };
  try {
    body = (await request.json()) as { phone?: string; code?: string };
  } catch {
    return createCorsResponse(createErrorResponse('请求体必须是 JSON'), 400);
  }

  const phone = (body.phone || '').trim();
  const code = (body.code || '').trim();

  if (!phone || !code) {
    return createCorsResponse(createErrorResponse('手机号和验证码不能为空'), 400);
  }

  try {
    const auth = new AuthService(env);
    const { userId, token } = await auth.verifyCode(phone, code);

    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Set-Cookie', setTokenCookie(token, 604800));

    return new Response(
      JSON.stringify({ ok: true, userId }),
      { status: 200, headers },
    );
  } catch (err) {
    const status = errorStatus(err);
    const message = err instanceof Error ? err.message : '验证失败';
    console.log('[auth] verifyCode error', { phone: '***', status, error: message });
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

  const auth = new AuthService(env);
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
  headers.set('Content-Type', 'application/json');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Set-Cookie', setTokenCookie('', 0));

  return new Response(
    JSON.stringify({ ok: true }),
    { status: 200, headers },
  );
}
