import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCosyVoiceTTS } from '../useCosyVoiceTTS';

describe('useCosyVoiceTTS', () => {
  const mockPlay = vi.fn().mockResolvedValue(undefined);
  const mockPause = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();

    // Mock Audio
    vi.stubGlobal('Audio', vi.fn().mockImplementation(() => ({
      play: mockPlay,
      pause: mockPause,
      onended: null as (() => void) | null,
      onerror: null as (() => void) | null,
    })));

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('initial state: not speaking, no prompt, no error', () => {
    const { result } = renderHook(() => useCosyVoiceTTS());
    expect(result.current.isSpeaking).toBe(false);
    expect(result.current.hasPromptAudio).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('hasPromptAudio is true when localStorage has prompt audio', () => {
    localStorage.setItem('resonance_prompt_audio', 'data:audio/wav;base64,test');
    const { result } = renderHook(() => useCosyVoiceTTS());
    expect(result.current.hasPromptAudio).toBe(true);
  });

  it('clearPromptAudio removes from localStorage and sets hasPromptAudio false', () => {
    localStorage.setItem('resonance_prompt_audio', 'data:audio/wav;base64,test');
    localStorage.setItem('resonance_prompt_text', '测试文本');
    const { result } = renderHook(() => useCosyVoiceTTS());
    expect(result.current.hasPromptAudio).toBe(true);

    act(() => {
      result.current.clearPromptAudio();
    });

    expect(result.current.hasPromptAudio).toBe(false);
    expect(localStorage.getItem('resonance_prompt_audio')).toBeNull();
    expect(localStorage.getItem('resonance_prompt_text')).toBeNull();
  });

  it('stop pauses audio and resets state', () => {
    const { result } = renderHook(() => useCosyVoiceTTS());
    act(() => {
      result.current.stop();
    });
    expect(result.current.isSpeaking).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('speak in SFT mode sends JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['audio'], { type: 'audio/wav' })),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCosyVoiceTTS());
    await act(async () => {
      await result.current.speak('你好');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/functions/v1/cosyvoice-tts');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({ text: '你好' });
  });

  it('speak handles API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'TTS 服务不可用' }),
    }));

    const { result } = renderHook(() => useCosyVoiceTTS());
    await act(async () => {
      await result.current.speak('测试');
    });

    expect(result.current.isSpeaking).toBe(false);
    expect(result.current.error).toBe('TTS 服务不可用');
  });

  it('speak handles network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('网络连接失败')));

    const { result } = renderHook(() => useCosyVoiceTTS());
    await act(async () => {
      await result.current.speak('测试');
    });

    expect(result.current.isSpeaking).toBe(false);
    expect(result.current.error).toBe('网络连接失败');
  });

  it('speak handles missing VITE_SUPABASE_URL', async () => {
    // import.meta.env.VITE_SUPABASE_URL is set in vitest env, but we can test the error path
    const origUrl = import.meta.env.VITE_SUPABASE_URL;
    import.meta.env.VITE_SUPABASE_URL = '';

    const { result } = renderHook(() => useCosyVoiceTTS());
    await act(async () => {
      await result.current.speak('测试');
    });

    expect(result.current.error).toBe('未配置后端地址');
    import.meta.env.VITE_SUPABASE_URL = origUrl;
  });
});
