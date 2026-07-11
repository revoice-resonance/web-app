/**
 * Auth state hook — single source of truth for authentication state.
 *
 * Session authentication is cookie-based (JWT in HttpOnly cookie). This hook:
 *  - Checks the existing session on mount (GET /api/auth/session)
 *  - Auto-authenticates via deviceId when SMS is not configured (anonymous flow)
 *  - Provides sendCode / verifyCode for the SMS login wizard
 *  - Provides bindPhone for upgrading anonymous users to phone-bound identity
 *  - Provides logout for session termination
 *
 * Return shape exposes AuthState fields (status, userId, phone) plus
 * the four actions, matching the convention established by useCloudASR
 * (useState + useCallback, raw fetch, structured error handling).
 */

import { useState, useEffect, useCallback } from 'react';
import type { AuthState, LoginStep } from '@/types/auth';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';

/** Extract a user-facing error message from an API error, with status-specific handling. */
function extractAuthError(err: unknown, messages: {
  expired?: string;
  rateLimited?: string;
  badCode?: string;
  tooManyAttempts?: string;
  default?: string;
  network?: string;
}): string {
  if (err instanceof ApiError) {
    if (err.status === 410 && messages.expired) return messages.expired;
    if (err.status === 429 && messages.rateLimited) return messages.rateLimited;
    if (err.status === 403) {
      const body = err.body as { error?: string } | undefined;
      if (body?.error && messages.tooManyAttempts && body.error.includes('过多')) return messages.tooManyAttempts;
      if (messages.badCode) return messages.badCode;
    }
    const body = err.body as { error?: string } | undefined;
    return body?.error || messages.default || '请求失败';
  }
  return messages.network || '网络错误，请重试';
}

export function useAuth(deviceId: string | null = null) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  // On mount: check session. If SMS is not configured and we have a
  // deviceId, the Worker auto-creates an anonymous session and returns
  // Set-Cookie — so this single call covers all three paths:
  //   1. valid JWT cookie → authenticated
  //   2. no cookie + X-Device-Id + !sms → auto-anonymous → authenticated
  //   3. no cookie + SMS available → guest (LoginPage shown)
  useEffect(() => {
    let cancelled = false;

    const headers: Record<string, string> = {};
    if (deviceId) {
      headers['X-Device-Id'] = deviceId;
    }

    api.auth.getSession(headers)
      .then((envelope) => {
        if (cancelled) return;
        const session = envelope.data;
        if (session.userId) {
          setState({
            status: 'authenticated',
            userId: session.userId,
            phone: session.phone || undefined,
          });
        } else {
          setState({ status: 'guest' });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: 'guest' });
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  const sendCode = useCallback(async (phone: string): Promise<LoginStep> => {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      toast.error('请输入正确的手机号');
      return 'phone';
    }
    try {
      await api.auth.sendCode(phone);
      return 'code';
    } catch (err) {
      toast.error(extractAuthError(err, {
        rateLimited: '发送过于频繁，请稍后再试',
        default: '短信发送失败，请稍后再试',
        network: '网络错误，请重试',
      }));
    }
    return 'phone';
  }, []);

  const verifyCode = useCallback(
    async (phone: string, code: string): Promise<LoginStep> => {
      try {
        const data = await api.auth.verifyCode(phone, code);
        const sessionEnvelope = await api.auth.getSession();
        const session = sessionEnvelope.data;
        setState({
          status: 'authenticated',
          userId: data.userId,
          phone: session.phone || undefined,
        });
        return 'success';
      } catch (err) {
        toast.error(extractAuthError(err, {
          expired: '验证码已过期，请重新获取',
          badCode: '验证码错误',
          tooManyAttempts: '验证码错误次数过多，请重新获取',
          default: '验证失败',
          network: '网络错误，请重试',
        }));
      }
      return 'code';
    },
    [],
  );

  /**
   * Bind a phone number to an anonymous account.
   *
   * Upgrades an anonymous user (deviceId-based) to a phone-bound identity.
   * On success, re-checks the session to update auth state.
   */
  const bindPhone = useCallback(
    async (phone: string, code: string): Promise<boolean> => {
      try {
        const data = await api.auth.bindPhone(phone, code);
        const sessionEnvelope = await api.auth.getSession();
        const session = sessionEnvelope.data;
        setState({
          status: 'authenticated',
          userId: data.userId,
          phone: session.phone || undefined,
        });
        toast.success('手机号绑定成功');
        return true;
      } catch (err) {
        toast.error(extractAuthError(err, {
          expired: '验证码已过期，请重新获取',
          badCode: '验证码错误',
          default: '绑定失败',
          network: '网络错误，请重试',
        }));
      }
      return false;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      /* ignore */
    }
    setState({ status: 'guest' });
  }, []);

  return { ...state, sendCode, verifyCode, bindPhone, logout };
}
