/**
 * LoginPage — multi-step phone SMS login wizard.
 *
 * Three-step flow controlled by local loginStep state:
 *   'phone'   → phone input + "获取验证码" button + guest skip
 *   'code'    → 6-digit code input with 60s countdown + resend + back
 *   'success' → brief checkmark indicator (parent AppRoutes handles redirect)
 *
 * Uses the useAuth() hook (S8) for all API interactions. The hook handles
 * toast error messages; this page handles inline validation errors and the
 * countdown timer.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { LoginStep } from '@/types/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PHONE_REGEX = /^1[3-9]\d{9}$/;
const COUNTDOWN_SECONDS = 60;

// ---------------------------------------------------------------------------
// Inline Spinner (no existing Spinner primitive in the codebase)
// ---------------------------------------------------------------------------

/** Simple SVG spinner matching Tailwind's `animate-spin`. */
function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// LoginPage
// ---------------------------------------------------------------------------

export default function LoginPage({ onSkip }: { onSkip: () => void }) {
  const { sendCode, verifyCode } = useAuth();

  // Step state
  const [loginStep, setLoginStep] = useState<LoginStep>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [countdown, setCountdown] = useState(0);

  const codeInputRef = useRef<HTMLInputElement>(null);

  // -----------------------------------------------------------------------
  // Countdown timer
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // -----------------------------------------------------------------------
  // Auto-focus code input when transitioning to code step
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (loginStep === 'code') {
      // Small delay to ensure the input is mounted before focusing
      const raf = requestAnimationFrame(() => codeInputRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [loginStep]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  /** Send verification code after client-side phone validation. */
  const handleSendCode = useCallback(async () => {
    if (!PHONE_REGEX.test(phone)) {
      setPhoneError('请输入正确的11位手机号');
      return;
    }
    setPhoneError('');
    setIsSending(true);
    try {
      const nextStep = await sendCode(phone);
      if (nextStep === 'code') {
        setLoginStep('code');
        setCountdown(COUNTDOWN_SECONDS);
        setCode('');
        setCodeError('');
      }
      // If sendCode returns 'phone', the hook already showed a toast — stay on phone step
    } finally {
      setIsSending(false);
    }
  }, [phone, sendCode]);

  /** Verify the 6-digit code. Only called when code reaches 6 characters. */
  const handleVerifyCode = useCallback(
    async (codeValue: string) => {
      if (codeValue.length !== 6) return;
      setIsVerifying(true);
      setCodeError('');
      try {
        const nextStep = await verifyCode(phone, codeValue);
        if (nextStep === 'success') {
          setLoginStep('success');
        }
        // If verifyCode returns 'code', the hook already showed a toast — stay on code step
      } finally {
        setIsVerifying(false);
      }
    },
    [phone, verifyCode],
  );

  /** Handle code input change — strip non-digits, cap at 6, auto-submit. */
  const handleCodeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value.replace(/\D/g, '').slice(0, 6);
      setCode(val);
      if (val.length === 6) {
        handleVerifyCode(val);
      }
    },
    [handleVerifyCode],
  );

  /** Resend the verification code. */
  const handleResend = useCallback(async () => {
    setIsSending(true);
    setCodeError('');
    try {
      const nextStep = await sendCode(phone);
      if (nextStep === 'code') {
        setCountdown(COUNTDOWN_SECONDS);
        setCode('');
        codeInputRef.current?.focus();
      }
    } finally {
      setIsSending(false);
    }
  }, [phone, sendCode]);

  /** Skip login — enter guest mode, bypass the auth gate. */
  const handleSkip = useCallback(() => {
    onSkip();
  }, [onSkip]);

  /** Go back to phone input step. */
  const handleBackToPhone = useCallback(() => {
    setLoginStep('phone');
    setCode('');
    setCodeError('');
    setCountdown(0);
  }, []);

  /** Phone input change — strip non-digits, cap at 11, clear error on change. */
  const handlePhoneChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value.replace(/\D/g, '').slice(0, 11);
      setPhone(val);
      if (phoneError) setPhoneError('');
    },
    [phoneError],
  );

  /** Submit phone step on Enter key. */
  const handlePhoneKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSendCode();
    },
    [handleSendCode],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6 space-y-5">
          {/* App title — always visible */}
          <div className="text-center">
            <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              共鸣
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              登录以同步你的音色数据
            </p>
          </div>

          {/* ============================================================ */}
          {/* Phone step */}
          {/* ============================================================ */}
          {loginStep === 'phone' && (
            <>
              <div className="space-y-2">
                <Input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={11}
                  placeholder="请输入手机号"
                  value={phone}
                  onChange={handlePhoneChange}
                  onKeyDown={handlePhoneKeyDown}
                  disabled={isSending}
                  className="min-h-[44px] text-base"
                  aria-label="手机号"
                  aria-describedby={phoneError ? 'phone-error' : undefined}
                  aria-invalid={!!phoneError}
                />
                {phoneError && (
                  <p
                    id="phone-error"
                    className="text-sm text-destructive"
                    role="alert"
                  >
                    {phoneError}
                  </p>
                )}
              </div>

              <Button
                className="w-full min-h-[44px]"
                onClick={handleSendCode}
                disabled={isSending || phone.length === 0}
              >
                {isSending ? (
                  <>
                    <Spinner className="h-4 w-4" />
                    发送中...
                  </>
                ) : (
                  '获取验证码'
                )}
              </Button>

              <div className="text-center">
                <Button
                  variant="ghost"
                  className="text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
                  onClick={handleSkip}
                >
                  跳过登录，先体验
                </Button>
              </div>
            </>
          )}

          {/* ============================================================ */}
          {/* Code step */}
          {/* ============================================================ */}
          {loginStep === 'code' && (
            <>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  验证码已发送至 +86 {phone}
                </p>
              </div>

              <div className="space-y-2">
                <Input
                  ref={codeInputRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="请输入6位验证码"
                  value={code}
                  onChange={handleCodeChange}
                  disabled={isVerifying}
                  className="min-h-[44px] text-center text-lg tracking-[0.5em]"
                  aria-label="验证码"
                  aria-describedby={codeError ? 'code-error' : undefined}
                  aria-invalid={!!codeError}
                />
                {codeError && (
                  <p
                    id="code-error"
                    className="text-sm text-destructive"
                    role="alert"
                  >
                    {codeError}
                  </p>
                )}
              </div>

              {isVerifying && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Spinner className="h-4 w-4" />
                  验证中...
                </div>
              )}

              {/* Resend / countdown */}
              <div className="flex items-center justify-between text-sm">
                {countdown > 0 ? (
                  <span className="text-muted-foreground">
                    重新获取 ({countdown}s)
                  </span>
                ) : (
                  <button
                    type="button"
                    className="text-primary hover:underline min-h-[44px] flex items-center"
                    onClick={handleResend}
                    disabled={isSending}
                  >
                    {isSending ? (
                      <>
                        <Spinner className="h-3 w-3 mr-1" />
                        发送中...
                      </>
                    ) : (
                      '重新获取'
                    )}
                  </button>
                )}
              </div>

              {/* "未收到验证码？" — visible only after countdown ends */}
              {countdown === 0 && !isSending && (
                <p className="text-center text-sm text-muted-foreground">
                  未收到验证码？
                </p>
              )}

              {/* Back to phone */}
              <div className="text-center">
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
                  onClick={handleBackToPhone}
                  disabled={isVerifying}
                >
                  返回修改手机号
                </button>
              </div>
            </>
          )}

          {/* ============================================================ */}
          {/* Success step */}
          {/* ============================================================ */}
          {loginStep === 'success' && (
            <div className="flex flex-col items-center justify-center py-6 space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <Check className="h-6 w-6 text-green-600" aria-hidden="true" />
              </div>
              <p className="text-lg font-semibold text-foreground">登录成功</p>
              <p className="text-sm text-muted-foreground">正在跳转...</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
