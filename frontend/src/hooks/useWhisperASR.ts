import { useState, useCallback } from 'react';
import {
  buildASRError,
  emitTelemetry,
  statusToErrorCode,
  type ASRError,
} from '@/types/asrError';

interface UseWhisperASRReturn {
  finalText: string;
  isProcessing: boolean;
  /** 结构化错误对象（含用户消息 + 运维诊断） */
  error: ASRError | null;
  /**
   * 向后兼容：旧代码读 `error` 当字符串用。
   * 新代码请用 `error.userMessage` / `error.code`。
   */
  errorMessage: string | null;
  transcribe: (audioBlob: Blob) => Promise<string | null>;
  reset: () => void;
}

// ====== P0-3 常量 ======
const TOTAL_DEADLINE_MS = 25000;
const PER_REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2; // 初始 + 2 次重试 = 共 3 次尝试
const BASE_DELAY_MS = 300;
const MAX_DELAY_MS = 5000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** axios-retry 决策树：仅 5xx / 429 / 网络错误重试，4xx 不重试 */
function isRetryable(status: number | null): boolean {
  if (status === null) return true; // 网络 / timeout
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}

/** AWS Full Jitter（Marc Brooker 2015） */
function backoffWithJitter(attempt: number): number {
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  return Math.random() * exp;
}

/** 解析 Retry-After，封顶 60s 防 DoS */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return Math.min(seconds * 1000, 60000);
  const date = Date.parse(header);
  if (!Number.isNaN(date))
    return Math.min(Math.max(0, date - Date.now()), 60000);
  return null;
}

/**
 * Try browser-native Web Speech API as fallback when Whisper is offline.
 * Returns the transcript or null if unsupported / failed.
 */
function browserSpeechFallback(): Promise<string | null> {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      resolve(null);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    let settled = false;
    const finish = (text: string | null) => {
      if (settled) return;
      settled = true;
      resolve(text);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript =
        event.results?.[0]?.[0]?.transcript?.trim() || '';
      finish(transcript || null);
    };
    recognition.onerror = () => finish(null);
    recognition.onnomatch = () => finish(null);
    recognition.onend = () => finish(null);

    setTimeout(() => finish(null), 8000);
    recognition.start();
  });
}

export function useWhisperASR(): UseWhisperASRReturn {
  const [finalText, setFinalText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<ASRError | null>(null);

  const transcribe = useCallback(
    async (audioBlob: Blob): Promise<string | null> => {
      setError(null);
      setIsProcessing(true);
      setFinalText('');

      const startTime = Date.now();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      if (!supabaseUrl) {
        const err = buildASRError('ALL_FAILED', {
          status: null,
          attempts: 0,
          totalDurationMs: 0,
          originalError: '未配置后端地址 (VITE_SUPABASE_URL)',
          timestamp: new Date().toISOString(),
        });
        emitTelemetry(err);
        setError(err);
        setIsProcessing(false);
        return null;
      }

      // 提前判断离线，避免无谓重试
      if (
        typeof navigator !== 'undefined' &&
        navigator.onLine === false
      ) {
        const err = buildASRError('NETWORK_OFFLINE', {
          status: null,
          attempts: 0,
          totalDurationMs: 0,
          originalError: 'navigator.onLine === false',
          timestamp: new Date().toISOString(),
        });
        emitTelemetry(err);
        setError(err);
        setIsProcessing(false);
        return null;
      }

      // FormData 可复用（SO Q35138135），File/Blob 每次新流
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');

      const deadline = startTime + TOTAL_DEADLINE_MS;
      let lastStatus: number | null = null;
      let lastStatusText: string | undefined;
      let lastRequestId: string | null = null;
      let lastRetryAfterMs: number | null = null;
      let lastError: Error | null = null;
      let attemptCount = 0;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        attemptCount = attempt + 1;
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;

        const controller = new AbortController();
        const perRequestTimer = setTimeout(
          () => controller.abort(),
          Math.min(PER_REQUEST_TIMEOUT_MS, remaining),
        );

        try {
          const response = await fetch(
            `${supabaseUrl}/functions/v1/whisper-asr`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              },
              body: formData,
              signal: controller.signal,
            },
          );

          lastStatus = response.status;
          lastStatusText = response.statusText;
          lastRequestId =
            response.headers.get('x-request-id') ??
            response.headers.get('x-supabase-request-id');

          const data = await response.json().catch(() => ({}));

          if (response.ok && data.ok !== false) {
            const text = (data.text?.trim() || '') || null;
            if (text) {
              setFinalText(text);
            } else {
              // 后端返回 200 但空文本 — 非错误，设一个告知
              const err = buildASRError(
                'BAD_REQUEST',
                {
                  status: 200,
                  attempts: attemptCount,
                  totalDurationMs: Date.now() - startTime,
                  requestId: lastRequestId,
                  originalError: '服务返回空识别结果',
                  timestamp: new Date().toISOString(),
                },
                false,
              );
              // 这个不走 emitTelemetry（不是异常），只内部设 state
              err.userMessage = '未能识别到语音内容';
              err.userAction = '请重新录音，说话稍大声清楚一些';
              err.retryable = true;
              setError(err);
            }
            setIsProcessing(false);
            return text;
          }

          // 业务错误分支
          lastError = new Error(
            data.error || `请求失败 (${response.status})`,
          );

          if (!isRetryable(response.status)) break;

          const retryAfter = parseRetryAfter(
            response.headers.get('retry-after'),
          );
          lastRetryAfterMs = retryAfter;
          const delay = retryAfter ?? backoffWithJitter(attempt);
          const actualDelay = Math.min(delay, deadline - Date.now());
          if (actualDelay <= 0) break;

          await sleep(actualDelay);
        } catch (e) {
          lastError =
            e instanceof Error ? e : new Error(String(e));

          // abort = timeout, name === 'AbortError'
          if (attempt < MAX_RETRIES && deadline - Date.now() > 0) {
            const delay = Math.min(
              backoffWithJitter(attempt),
              deadline - Date.now(),
            );
            if (delay > 0) await sleep(delay);
          }
        } finally {
          clearTimeout(perRequestTimer);
        }
      }

      // 所有重试耗尽 → 尝试浏览器降级
      const fallbackText = await browserSpeechFallback();
      const totalDurationMs = Date.now() - startTime;

      if (fallbackText) {
        setFinalText(fallbackText);
        // 降级成功也要告知用户（FALLBACK_ACTIVE 是告知非错误）
        const notice = buildASRError(
          'FALLBACK_ACTIVE',
          {
            status: lastStatus,
            statusText: lastStatusText,
            attempts: attemptCount,
            totalDurationMs,
            requestId: lastRequestId,
            originalError: lastError?.message,
            retryAfterMs: lastRetryAfterMs,
            timestamp: new Date().toISOString(),
          },
          true,
        );
        emitTelemetry(notice);
        setError(notice);
        setIsProcessing(false);
        return fallbackText;
      }

      // 主 + 降级全挂
      const isOffline =
        typeof navigator !== 'undefined' &&
        navigator.onLine === false;
      const code = isOffline
        ? 'NETWORK_OFFLINE'
        : lastStatus !== null
          ? statusToErrorCode(lastStatus)
          : lastError?.name === 'AbortError'
            ? 'NETWORK_TIMEOUT'
            : 'ALL_FAILED';

      const err = buildASRError(
        code,
        {
          status: lastStatus,
          statusText: lastStatusText,
          attempts: attemptCount,
          totalDurationMs,
          requestId: lastRequestId,
          originalError: lastError?.message,
          retryAfterMs: lastRetryAfterMs,
          timestamp: new Date().toISOString(),
        },
        false,
      );
      emitTelemetry(err);
      setError(err);
      setIsProcessing(false);
      return null;
    },
    [],
  );

  const reset = useCallback(() => {
    setFinalText('');
    setIsProcessing(false);
    setError(null);
  }, []);

  return {
    finalText,
    isProcessing,
    error,
    errorMessage: error?.userMessage ?? null,
    transcribe,
    reset,
  };
}
