/**
 * CloudSpeech ASR hook — primary speech recognition engine.
 *
 * Replaces the deprecated `useWhisperASR`. Sends base64-encoded audio to
 * the Worker proxy endpoint `POST /api/asr/cloud-speech` with automatic retry
 * and a 2-tier fallback chain:
 *   CloudSpeech (cloud) → Browser Web Speech API (local)
 *
 * Return interface matches `useWhisperASR` for drop-in compatibility.
 */

import { useState, useCallback } from 'react';
import {
  buildASRError,
  emitTelemetry,
  statusToErrorCode,
  type ASRError,
} from '@/types/asrError';

/** Return interface — identical shape to useWhisperASR for drop-in replacement. */
interface UseCloudSpeechASRReturn {
  finalText: string;
  isProcessing: boolean;
  /** Structured error object (user message + diagnostics). */
  error: ASRError | null;
  /**
   * Backward-compatible: old code reads `error` as a string.
   * New code should use `error.userMessage` / `error.code`.
   */
  errorMessage: string | null;
  transcribe: (audioBlob: Blob) => Promise<string | null>;
  reset: () => void;
}

// ====== Constants ======
const TOTAL_DEADLINE_MS = 25000;
const PER_REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2; // initial + 2 retries = 3 total attempts
const BASE_DELAY_MS = 300;
const MAX_DELAY_MS = 5000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry decision: only 5xx / 429 / network errors are retryable.
 * 4xx (including 400, 401, 413) and 501 NOT_IMPLEMENTED are permanent.
 */
function isRetryable(status: number | null): boolean {
  if (status === null) return true; // network / timeout
  if (status === 501) return false; // NOT_IMPLEMENTED is a permanent error
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}

/** AWS Full Jitter (Marc Brooker 2015). */
function backoffWithJitter(attempt: number): number {
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  return Math.random() * exp;
}

/**
 * Parse Retry-After header value.
 * Handles both seconds (integer) and HTTP-date formats. Capped at 60s.
 */
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
 * Browser-native Web Speech API fallback.
 * Returns the transcript or null if unsupported / failed.
 */
function browserSpeechFallback(): Promise<string | null> {
  return new Promise((resolve) => {
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

/**
 * Convert a Blob to a base64 string (without the data URI prefix).
 *
 * Uses FileReader.readAsDataURL then strips the `data:...;base64,` preamble.
 * Rejects on FileReader error or if the result is not a string.
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.result && typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1] || '';
        resolve(base64);
      } else {
        reject(new Error('FileReader did not return a string'));
      }
    };
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

export function useCloudSpeechASR(): UseCloudSpeechASRReturn {
  const [finalText, setFinalText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<ASRError | null>(null);

  const transcribe = useCallback(
    async (audioBlob: Blob): Promise<string | null> => {
      // Edge case: null or empty blob — return immediately, no network request
      if (!audioBlob || audioBlob.size === 0) {
        return null;
      }

      // Pre-flight: offline check — skip retries, return error immediately
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const offlineErr = buildASRError(
          'NETWORK_OFFLINE',
          {
            status: null,
            attempts: 0,
            totalDurationMs: 0,
            timestamp: new Date().toISOString(),
          },
          false,
        );
        emitTelemetry(offlineErr);
        setError(offlineErr);
        return null;
      }

      setError(null);
      setIsProcessing(true);
      setFinalText('');

      const startTime = Date.now();
      const mimeType = audioBlob.type || 'audio/webm';

      // Compute base64 once before the retry loop (audio blob does not change)
      let base64: string;
      try {
        base64 = await blobToBase64(audioBlob);
      } catch {
        const err = buildASRError(
          'BAD_REQUEST',
          {
            status: null,
            attempts: 0,
            totalDurationMs: Date.now() - startTime,
            originalError: 'base64 conversion failed',
            timestamp: new Date().toISOString(),
          },
          false,
        );
        emitTelemetry(err);
        setError(err);
        setIsProcessing(false);
        return null;
      }

      const payload = {
        audio: base64,
        mimeType,
        model: 'stepaudio-2.5-asr',
        language: 'zh',
      };

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
          const response = await fetch('/api/asr/cloud-speech', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });

          lastStatus = response.status;
          lastStatusText = response.statusText;
          lastRequestId =
            response.headers.get('x-request-id') ??
            response.headers.get('x-supabase-request-id');

          const data = await response.json().catch(() => ({}));

          if (response.ok && data.ok !== false) {
            // The Worker returns `{ ok: true, data: { text, model, elapsed_ms } }`
            // Also handle raw `{ text }` shape for flexibility
            const text =
              (data.data?.text?.trim() || data.text?.trim() || '') || null;

            if (text) {
              setFinalText(text);
            } else {
              // 200 but empty recognition — inform the user
              const emptyErr = buildASRError(
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
              emptyErr.userMessage = '未能识别到语音内容';
              emptyErr.userAction = '请重新录音，说话稍大声清楚一些';
              emptyErr.retryable = true;
              setError(emptyErr);
            }
            setIsProcessing(false);
            return text;
          }

          // Business error branch
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

      // All retries exhausted → attempt browser fallback
      const fallbackText = await browserSpeechFallback();
      const totalDurationMs = Date.now() - startTime;

      if (fallbackText) {
        setFinalText(fallbackText);
        // Fallback success is informational (FALLBACK_ACTIVE is a notice, not an error)
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

      // Primary + fallback all failed
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
