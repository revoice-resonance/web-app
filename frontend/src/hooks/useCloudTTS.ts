import { useCallback, useRef, useState } from 'react';
import { api } from '@/lib/api';

/**
 * CosyVoice TTS hook — primary speech synthesis engine.
 *
 * Sends text to the Worker proxy endpoint `POST /api/tts/speak`,
 * receives audio, and plays it. The frontend never touches the
 * upstream API key — auth is handled entirely on the Worker.
 */

export type CloudVoice =
  | 'alloy'       // 中性女声
  | 'echo'        // 温和男声
  | 'fable'       // 英式男声
  | 'onyx'        // 深沉男声
  | 'nova'        // 温柔女声
  | 'shimmer'     // 清晰女声
  | string;       // 也支持自定义音色 ID

export type CloudTtsModel = 'tts-1' | 'tts-1-hd';

export interface CloudTtsSpeakOptions {
  voice?: CloudVoice;
  model?: CloudTtsModel;
  speed?: number;        // 0.25 ~ 4.0，默认 1.0
  volume?: number;       // 0.1 ~ 2.0，默认 1.0
  response_format?: 'mp3' | 'wav' | 'flac' | 'opus';
  sample_rate?: 8000 | 16000 | 22050 | 24000 | 48000;
  instruction?: string;  // 可选语音指令
}

interface UseCloudTTSReturn {
  speak: (text: string, options?: CloudTtsSpeakOptions) => Promise<void>;
  stop: () => void;
  isSpeaking: boolean;
  error: string | null;
}

export function useCloudTTS(defaults?: CloudTtsSpeakOptions): UseCloudTTSReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    setIsSpeaking(false);
    setError(null);
  }, []);

  const speak = useCallback(async (text: string, options?: CloudTtsSpeakOptions) => {
    const trimmed = (text || '').trim();
    if (!trimmed) return;

    stop();
    setError(null);
    setIsSpeaking(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const merged = { ...defaults, ...options };
    const payload = {
      text: trimmed,
      voice: merged.voice,
      model: merged.model,
      speed: merged.speed,
      volume: merged.volume,
      response_format: merged.response_format,
      sample_rate: merged.sample_rate,
      instruction: merged.instruction,
    };

    try {
      const audioBlob = await api.tts.speak(payload, controller.signal);

      if (controller.signal.aborted) return;

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      const cleanup = () => {
        URL.revokeObjectURL(audioUrl);
        setIsSpeaking(false);
        if (audioRef.current === audio) audioRef.current = null;
      };
      audio.onended = cleanup;
      audio.onerror = () => {
        setError('音频播放失败');
        cleanup();
      };

      await audio.play();
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        setIsSpeaking(false);
        return;
      }
      const message = err instanceof Error ? err.message : '语音合成播放失败';
      setError(message);
      setIsSpeaking(false);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [defaults, stop]);

  return { speak, stop, isSpeaking, error };
}