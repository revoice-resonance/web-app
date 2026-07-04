/**
 * Auth service — SMS verification code generation, sending, JWT sign/verify,
 * and session management.  Pure Web Crypto (no third-party JWT library).
 *
 * Exports:
 *   AuthService  — code gen, sendCode, verifyCode, getSession
 *   sha256Hex     — SHA-256 hex digest (used by auth handlers for anonymous)
 *   signJWT       — HS256 JWT signing (used by auth handlers for anonymous/bind-phone)
 */

import type { StorageAdapter } from '../db/adapter';
import { sendSms } from './SMSService';
import type { Env } from '../types/env';

export class AuthService {
  constructor(
    private adapter: StorageAdapter,
    private jwtSecret: string,
    private env: Env,
  ) {}

  generateCode(): string {
    // 6 random digits via crypto.getRandomValues
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    const num = (buf[0] << 24 | buf[1] << 16 | buf[2] << 8 | buf[3]) >>> 0;
    return String(num % 1000000).padStart(6, '0');
  }

  async sendCode(phone: string, ip: string): Promise<void> {
    // Validate phone format
    if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error('手机号格式错误');

    // Cleanup expired codes
    await this.adapter.cleanupExpiredCodes();

    // 60s cooldown check
    const existing = await this.adapter.getCode(phone);
    if (existing) {
      const created = new Date(existing.createdAt).getTime();
      const elapsed = Date.now() - created;
      if (elapsed < 60000) {
        throw Object.assign(new Error('验证码发送过于频繁'), { status: 429, retryAfter: Math.ceil((60000 - elapsed) / 1000) });
      }
    }

    // Rate limit: per-phone 5/hr
    const { phoneCount, ipCount } = await this.adapter.countRecentRequests(phone, ip, 60);
    if (phoneCount >= 5) {
      throw Object.assign(new Error('该手机号请求过于频繁，请稍后再试'), { status: 429 });
    }

    // Rate limit: per-IP 10/hr
    if (ipCount >= 10) {
      throw Object.assign(new Error('请求过于频繁，请稍后再试'), { status: 429 });
    }

    // Generate and store code
    const code = this.generateCode();
    await this.adapter.upsertCode(phone, code, 0);

    // Log the request
    await this.adapter.recordCodeRequest(phone, ip);

    // Send SMS (phone logged masked)
    const masked = '***' + phone.slice(-4);
    console.log('[auth] sendCode', { phone: masked, ip });
    // smsEnv carries the ali-sms config fields — extract from env via a
    // minimal interface so we don't need the whole Env object.
    await sendSms(phone, code, this.env);
  }

  async verifyCode(phone: string, code: string): Promise<{ userId: string; token: string }> {
    // Lookup code
    const row = await this.adapter.getCode(phone);

    if (!row) {
      throw Object.assign(new Error('验证码已过期，请重新获取'), { status: 410 });
    }

    // Check expiry (5 min)
    const created = new Date(row.createdAt).getTime();
    if (Date.now() - created > 300_000) {
      await this.adapter.deleteCode(phone);
      throw Object.assign(new Error('验证码已过期，请重新获取'), { status: 410 });
    }

    // Check attempts
    const attempts = row.attempts;

    if (row.code !== code) {
      if (attempts >= 2) {
        // 3rd failure → invalidate
        await this.adapter.deleteCode(phone);
        throw Object.assign(new Error('验证码错误次数过多，请重新获取'), { status: 403 });
      }
      await this.adapter.upsertCode(phone, row.code, attempts + 1);
      throw Object.assign(new Error('验证码错误'), { status: 403 });
    }

    // Code matches → delete it, create user, sign JWT
    await this.adapter.deleteCode(phone);

    // Compute userId = "u_" + hex(SHA256(phone + JWT_SECRET))
    const userId = await computeUserId(phone, this.jwtSecret);

    // Upsert user
    const phoneHash = await sha256Hex(phone + this.jwtSecret);
    await this.adapter.upsertUser(userId, phoneHash);

    // Sign JWT (HS256, 7d expiry)
    const token = await signJWT(
      { sub: userId, phone: '****' + phone.slice(-4), iat: Math.floor(Date.now() / 1000) },
      this.jwtSecret,
      7 * 24 * 3600,
    );

    const masked = '****' + phone.slice(-4);
    console.log('[auth] verifyCode success', { userId, phone: masked });
    return { userId, token };
  }

  async getSession(token: string): Promise<{ phone: string; userId: string } | null> {
    try {
      const payload = await verifyJWT(token, this.jwtSecret);
      if (!payload || !payload.sub) return null;
      return { phone: (payload.phone as string) || '', userId: payload.sub as string };
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Crypto helpers (inline — same Web Crypto API as s3-signer.ts)
// ---------------------------------------------------------------------------

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function computeUserId(phone: string, jwtSecret: string): Promise<string> {
  return 'u_' + await sha256Hex(phone + jwtSecret);
}

async function signJWT(payload: Record<string, unknown>, secret: string, expiresInSeconds: number): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds };

  const encoder = new TextEncoder();
  const headerB64 = b64url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = b64url(encoder.encode(JSON.stringify(fullPayload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  const sigB64 = b64url(new Uint8Array(sig));

  return `${signingInput}.${sigB64}`;
}

async function verifyJWT(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const encoder = new TextEncoder();
    const signingInput = `${parts[0]}.${parts[1]}`;

    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
    const sigB64 = b64url(new Uint8Array(sig));

    if (sigB64 !== parts[2]) return null;

    const payloadJson = new TextDecoder().decode(fromB64url(parts[1]));
    const payload = JSON.parse(payloadJson);

    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

function b64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromB64url(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
