import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

/**
 * useVoiceClone — 录制参考音频 → 创建自定义音色 ID
 *
 * 发送录音到 POST /api/tts/voices/clone（multipart），
 * 返回新的音色 ID 供后续 TTS 使用。
 */

interface UseVoiceCloneReturn {
  clone: (audioBlob: Blob, referenceText?: string) => Promise<string | null>;
  isCloning: boolean;
  error: string | null;
}

export function useVoiceClone(): UseVoiceCloneReturn {
  const [isCloning, setIsCloning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clone = useCallback(async (audioBlob: Blob, referenceText?: string): Promise<string | null> => {
    setIsCloning(true);
    setError(null);

    try {
      // Determine filename from blob MIME type — the upstream /v1/files requires
      // a recognised audio extension.  Default to .wav (PCM) which is always
      // accepted; browser recordings should use includeWav:true.
      const mime = audioBlob.type || '';
      const ext = mime.includes('wav') || mime.includes('wave') ? 'wav'
        : mime.includes('mp3') || mime.includes('mpeg') ? 'mp3'
        : mime.includes('flac') ? 'flac'
        : mime.includes('ogg') || mime.includes('opus') ? 'ogg'
        : mime.includes('webm') ? 'webm'
        : mime.includes('aac') || mime.includes('mp4') ? 'm4a'
        : 'wav'; // fallback — WAV is universally accepted

      const formData = new FormData();
      formData.append('audio', audioBlob, `reference.${ext}`);
      if (referenceText) {
        formData.append('text', referenceText);
      }

      const data = await api.tts.cloneVoice(formData);

      return data.data?.voice_id || data.voice_id || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : '音色复刻失败';
      setError(message);
      return null;
    } finally {
      setIsCloning(false);
    }
  }, []);

  return { clone, isCloning, error };
}
