import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWhisperASR } from '../useWhisperASR';

describe('useWhisperASR', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('import', { meta: { env: { VITE_SUPABASE_URL: 'https://test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'test-key' } } });
  });

  it('initial state is correct', () => {
    const { result } = renderHook(() => useWhisperASR());
    expect(result.current.finalText).toBe('');
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('transcribe returns text on success', async () => {
    const mockResponse = { text: '你好世界' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }));

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

  it('transcribe returns null and sets error on empty text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: '' }),
    }));

    const { result } = renderHook(() => useWhisperASR());
    let text: string | null = null;
    await act(async () => {
      text = await result.current.transcribe(new Blob(['audio']));
    });

    expect(text).toBeNull();
    expect(result.current.error).toBe('未能识别到语音内容');
  });

  it('transcribe handles HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: '服务器内部错误' }),
    }));

    const { result } = renderHook(() => useWhisperASR());
    let text: string | null = null;
    await act(async () => {
      text = await result.current.transcribe(new Blob(['audio']));
    });

    expect(text).toBeNull();
    expect(result.current.error).toBe('服务器内部错误');
    expect(result.current.isProcessing).toBe(false);
  });

  it('transcribe handles HTTP error with no JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.reject(new Error('no json')),
    }));

    const { result } = renderHook(() => useWhisperASR());
    await act(async () => {
      await result.current.transcribe(new Blob(['audio']));
    });

    expect(result.current.error).toBe('请求失败 (503)');
  });

  it('transcribe handles network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const { result } = renderHook(() => useWhisperASR());
    await act(async () => {
      await result.current.transcribe(new Blob(['audio']));
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.isProcessing).toBe(false);
  });

  it('reset clears all state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: '测试' }),
    }));

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
  });

  it('transcribe sends correct FormData', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: 'ok' }),
    });
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
