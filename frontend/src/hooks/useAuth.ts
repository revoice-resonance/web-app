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

    fetch('/api/auth/session', { credentials: 'include', headers })
      .then((res) => res.json())
      .then(
        (data: { phone: string | null; userId: string | null; smsAvailable?: boolean }) => {
          if (cancelled) return;
          if (data.userId) {
            // Path 1 or 2: authenticated (JWT or auto-anonymous)
            setState({
              status: 'authenticated',
              userId: data.userId,
              phone: data.phone || undefined,
            });
          } else {
            // Path 3: SMS available, user must log in
            setState({ status: 'guest' });
          }
        },
      )
      .catch(() => {
        if (cancelled) return;
        setState({ status: 'guest' });
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  const sendCode = useCallback(async (phone: string): Promise<LoginStep> => {
    // Client-side phone validation
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      toast.error('请输入正确的手机号');
      return 'phone';
    }
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
        credentials: 'include',
      });
      if (res.ok) return 'code';

      if (res.status === 429) {
        toast.error('发送过于频繁，请稍后再试');
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || '短信发送失败，请稍后再试');
      }
    } catch {
      toast.error('网络错误，请重试');
    }
    return 'phone';
  }, []);

  const verifyCode = useCallback(
    async (phone: string, code: string): Promise<LoginStep> => {
      try {
        const res = await fetch('/api/auth/verify-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, code }),
          credentials: 'include',
        });

        if (res.ok) {
          const data = (await res.json()) as { ok: boolean; userId: string };
          // Re-check session to get phone
          const sessionRes = await fetch('/api/auth/session', {
            credentials: 'include',
          });
          const session = (await sessionRes.json()) as {
            phone: string | null;
            userId: string | null;
          };
          setState({
            status: 'authenticated',
            userId: data.userId,
            phone: session.phone || undefined,
          });
          return 'success';
        }

        if (res.status === 410) {
          toast.error('验证码已过期，请重新获取');
        } else if (res.status === 403) {
          const data = await res.json().catch(() => ({}));
          if (data.error && data.error.includes('过多')) {
            toast.error('验证码错误次数过多，请重新获取');
          } else {
            toast.error('验证码错误');
          }
        } else {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error || '验证失败');
        }
      } catch {
        toast.error('网络错误，请重试');
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
        const res = await fetch('/api/auth/bind-phone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, code }),
          credentials: 'include',
        });

        if (res.ok) {
          const data = (await res.json()) as { ok: boolean; userId: string };
          // Re-check session to get full auth state
          const sessionRes = await fetch('/api/auth/session', {
            credentials: 'include',
          });
          const session = (await sessionRes.json()) as {
            phone: string | null;
            userId: string | null;
          };
          setState({
            status: 'authenticated',
            userId: data.userId,
            phone: session.phone || undefined,
          });
          toast.success('手机号绑定成功');
          return true;
        }

        const err = await res.json().catch(() => ({}));
        if (res.status === 410) {
          toast.error('验证码已过期，请重新获取');
        } else if (res.status === 403) {
          toast.error(err.error || '验证码错误');
        } else {
          toast.error(err.error || '绑定失败');
        }
      } catch {
        toast.error('网络错误，请重试');
      }
      return false;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      /* ignore */
    }
    setState({ status: 'guest' });
  }, []);

  return { ...state, sendCode, verifyCode, bindPhone, logout };
}
