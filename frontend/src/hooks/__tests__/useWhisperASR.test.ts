import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWhisperASR } from '../useWhisperASR';

describe('useWhisperASR', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('import', { meta: { env: { VITE_SUPABASE_URL: 'https://test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'test-key' } } });
    // 保证默认在线，避免 pre-flight NETWORK_OFFLINE 提前返回
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    // 静默 emitTelemetry 的 console.warn
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const makeResponse = (body: object, init: { ok?: boolean; status?: number; headers?: Record<string, string> } = {}) => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: 'OK',
    headers: {
      get: (key: string) => init.headers?.[key.toLowerCase()] ?? null,
    },
    json: () => Promise.resolve(body),
  });

  it('initial state is correct', () => {
    const { result } = renderHook(() => useWhisperASR());
    expect(result.current.finalText).toBe('');
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  it('transcribe returns text on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({ text: '你好世界' })));

    const { result } = renderHook(() => useWhisperASR());
    const blob = new Blob(['audio'], { type: 'audio/webm' });

    let text: string | null = null;
    await act(async () => {
      text = await result.current.transcribe(blob);
    });

    expect(text).toBe('你好世界');
    expect(result.current.finalText).toBe('你好世界');
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('empty text → BAD_REQUEST with friendly message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({ text: '' })));

    const { result } = renderHook(() => useWhisperASR());
    let text: string | null = null;
    await act(async () => {
      text = await result.current.transcribe(new Blob(['audio']));
    });

    expect(text).toBeNull();
    expect(result.current.error?.code).toBe('BAD_REQUEST');
    expect(result.current.error?.userMessage).toBe('未能识别到语音内容');
    expect(result.current.errorMessage).toBe('未能识别到语音内容');
  });

  it('5xx retries and then falls back / fails with SERVER_ERROR', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({ error: '服务器内部错误' }, { ok: false, status: 500 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useWhisperASR());
    let text: string | null = null;
    await act(async () => {
      text = await result.current.transcribe(new Blob(['audio']));
    });

    // 3 次尝试（初始 + 2 retry）
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(text).toBeNull();
    expect(result.current.error?.code).toBe('SERVER_ERROR');
    expect(result.current.error?.diagnostics.attempts).toBe(3);
    expect(result.current.isProcessing).toBe(false);
  }, 40000);

  it('400 does NOT retry (4xx not retryable)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({ error: 'bad format' }, { ok: false, status: 400 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useWhisperASR());
    await act(async () => {
      await result.current.transcribe(new Blob(['audio']));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error?.code).toBe('BAD_REQUEST');
  });

  it('401 maps to AUTH_ERROR and no retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({ error: 'auth' }, { ok: false, status: 401 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useWhisperASR());
    await act(async () => {
      await result.current.transcribe(new Blob(['audio']));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error?.code).toBe('AUTH_ERROR');
    expect(result.current.error?.retryable).toBe(false);
  });

  it('network error exhausts retries → ALL_FAILED or NETWORK_*', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const { result } = renderHook(() => useWhisperASR());
    await act(async () => {
      await result.current.transcribe(new Blob(['audio']));
    });

    // 无 lastStatus + name !== 'AbortError' → ALL_FAILED
    expect(['ALL_FAILED', 'NETWORK_TIMEOUT']).toContain(result.current.error?.code);
    expect(result.current.isProcessing).toBe(false);
  }, 40000);

  it('offline pre-flight short-circuits with NETWORK_OFFLINE', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useWhisperASR());
    let text: string | null = null;
    await act(async () => {
      text = await result.current.transcribe(new Blob(['audio']));
    });

    expect(text).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.error?.code).toBe('NETWORK_OFFLINE');
  });

  it('reset clears all state including structured error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({ text: '测试' })));

    const { result } = renderHook(() => useWhisperASR());
    await act(async () => {
      await result.current.transcribe(new Blob(['audio']));
    });
    expect(result.current.finalText).toBe('测试');

    act(() => {
      result.current.reset();
    });

    expect(result.current.finalText).toBe('');
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  it('AbortError (timeout) 映射为 NETWORK_TIMEOUT', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    const { result } = renderHook(() => useWhisperASR());
    await act(async () => {
      await result.current.transcribe(new Blob(['audio']));
    });

    expect(result.current.error?.code).toBe('NETWORK_TIMEOUT');
    expect(result.current.error?.retryable).toBe(true);
    // 诊断字段齐全（给复制反馈按钮用）
    expect(result.current.error?.diagnostics.attempts).toBeGreaterThan(0);
    expect(result.current.error?.diagnostics.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.current.error?.diagnostics.timestamp).toBeTruthy();
  }, 40000);

  it('Retry-After header 被解析并写入诊断', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        makeResponse(
          { error: 'slow down' },
          { ok: false, status: 429, headers: { 'retry-after': '1' } },
        ),
      )
      .mockResolvedValueOnce(makeResponse({ text: '好了' }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useWhisperASR());
    let text: string | null = null;
    await act(async () => {
      text = await result.current.transcribe(new Blob(['audio']));
    });

    // 429 可重试，第二次成功
    expect(text).toBe('好了');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 40000);

  it('transcribe sends correct FormData', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse({ text: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useWhisperASR());
    const blob = new Blob(['audio'], { type: 'audio/webm' });
    await act(async () => {
      await result.current.transcribe(blob);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/functions/v1/whisper-asr');
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);
  });
});
