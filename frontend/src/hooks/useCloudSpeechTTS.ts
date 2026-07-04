import { useCallback, useRef, useState } from 'react';

/**
 * 阶跃星辰 (CloudSpeech) TTS hook
 *
 * 与 useCosyVoiceTTS 并列存在：
 * - useCosyVoiceTTS  → 走 X1 本地 CosyVoice（VPC binding）
 * - useCloudSpeechTTS    → 走云端 CloudSpeech API（worker 代理）
 *
 * 前端永远不接触 API key。Key 在 worker 端通过 wrangler secret 注入。
 */

export type CloudSpeechVoice =
  | 'wenrounvsheng'      // 温柔女声（默认，情感陪伴）
  | 'wenrounansheng'     // 温柔男声
  | 'linjiajiejie'       // 邻家姐姐
  | 'qinqienvsheng'      // 亲切女声
  | 'shenchennanyin'     // 深沉男音
  | 'cixingnansheng'     // 磁性男声
  | 'tianmeinvsheng'     // 甜美女声
  | 'ruyananshi'         // 儒雅男士
  | 'jingdiannvsheng'    // 经典女声
  | string;              // 也支持自定义复刻音色 ID

export type CloudSpeechModel = 'step-tts-mini' | 'step-tts-2' | 'stepaudio-2.5-tts';

export interface CloudSpeechSpeakOptions {
  voice?: CloudSpeechVoice;
  model?: CloudSpeechModel;
  speed?: number;        // 0.5 ~ 2.0，默认 1.0
  volume?: number;       // 0.1 ~ 2.0，默认 1.0
  response_format?: 'mp3' | 'wav' | 'flac' | 'opus';
  sample_rate?: 8000 | 16000 | 22050 | 24000 | 48000;
  instruction?: string;  // 仅 stepaudio-2.5-tts 生效
}

interface UseCloudSpeechTTSReturn {
  speak: (text: string, options?: CloudSpeechSpeakOptions) => Promise<void>;
  stop: () => void;
  isSpeaking: boolean;
  error: string | null;
}

const ENDPOINT = '/api/tts/cloud-speech';

export function useCloudSpeechTTS(defaults?: CloudSpeechSpeakOptions): UseCloudSpeechTTSReturn {
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

  const speak = useCallback(async (text: string, options?: CloudSpeechSpeakOptions) => {
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
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        let message = `CloudSpeech TTS 失败 (${response.status})`;
        try {
          const errBody = await response.json();
          if (errBody?.error) message = errBody.error;
        } catch {
          /* not json */
        }
        throw new Error(message);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const errBody = await response.json().catch(() => null);
        throw new Error(errBody?.error || 'CloudSpeech 返回了非音频响应');
      }

      const audioBlob = await response.blob();
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
      const message = err instanceof Error ? err.message : 'CloudSpeech TTS 播放失败';
      setError(message);
      setIsSpeaking(false);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [defaults, stop]);

  return { speak, stop, isSpeaking, error };
}
