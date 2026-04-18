import { useState, useCallback, useRef } from 'react';

const PROMPT_AUDIO_KEY = 'resonance_prompt_audio';
const PROMPT_TEXT_KEY = 'resonance_prompt_text';
const TARGET_PROMPT_SAMPLE_RATE = 24000;

interface UseCosyVoiceTTSReturn {
  speak: (text: string) => Promise<void>;
  stop: () => void;
  isSpeaking: boolean;
  /** Store a reference audio for zero-shot cloning */
  setPromptAudio: (blob: Blob, promptText?: string) => void;
  /** Clear stored prompt audio */
  clearPromptAudio: () => void;
  /** Whether a prompt audio is stored */
  hasPromptAudio: boolean;
  error: string | null;
}

function createAudioContext() {
  try {
    return new AudioContext({ sampleRate: TARGET_PROMPT_SAMPLE_RATE });
  } catch {
    return new AudioContext();
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('参考音频读取失败'));
    };
    reader.onerror = () => reject(new Error('参考音频读取失败'));
    reader.readAsDataURL(blob);
  });
}

async function hasWavHeader(blob: Blob): Promise<boolean> {
  if (blob.size < 12) return false;
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const wave = String.fromCharCode(...bytes.slice(8, 12));
  return riff === 'RIFF' && wave === 'WAVE';
}

function encodeWav(audioBuffer: AudioBuffer): Blob {
  const channelData = audioBuffer.getChannelData(0);
  const numChannels = 1;
  const sampleRate = audioBuffer.sampleRate;
  const buffer = new ArrayBuffer(44 + channelData.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + channelData.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, channelData.length * 2, true);

  for (let i = 0; i < channelData.length; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

async function normalizePromptAudio(blob: Blob): Promise<Blob> {
  if (await hasWavHeader(blob)) {
    return blob.type === 'audio/wav' ? blob : new Blob([await blob.arrayBuffer()], { type: 'audio/wav' });
  }

  const audioContext = createAudioContext();
  try {
    const source = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(source.slice(0));
    return encodeWav(audioBuffer);
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

export function useCosyVoiceTTS(): UseCosyVoiceTTSReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPromptAudio, setHasPromptAudio] = useState(() => {
    try {
      return !!localStorage.getItem(PROMPT_AUDIO_KEY);
    } catch {
      return false;
    }
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const promptBlobRef = useRef<Blob | null>(null);

  const clearPromptAudio = useCallback(() => {
    promptBlobRef.current = null;
    try {
      localStorage.removeItem(PROMPT_AUDIO_KEY);
      localStorage.removeItem(PROMPT_TEXT_KEY);
    } catch {
      /* ignore */
    }
    setHasPromptAudio(false);
  }, []);

  const persistPromptAudio = useCallback(async (blob: Blob, promptText?: string) => {
    const dataUrl = await blobToDataUrl(blob);
    localStorage.setItem(PROMPT_AUDIO_KEY, dataUrl);
    if (promptText) {
      localStorage.setItem(PROMPT_TEXT_KEY, promptText);
    }
  }, []);

  const setPromptAudio = useCallback((blob: Blob, promptText?: string) => {
    void (async () => {
      try {
        const normalizedBlob = await normalizePromptAudio(blob);
        await persistPromptAudio(normalizedBlob, promptText);
        promptBlobRef.current = normalizedBlob;
        setHasPromptAudio(true);
        setError(null);
      } catch {
        clearPromptAudio();
        setError('参考音频格式无效，请重新录制后再存为音色');
      }
    })();
  }, [clearPromptAudio, persistPromptAudio]);

  /** Load prompt blob from localStorage if not in memory */
  const getPromptBlob = useCallback(async (): Promise<Blob | null> => {
    if (promptBlobRef.current) return promptBlobRef.current;
    try {
      const dataUrl = localStorage.getItem(PROMPT_AUDIO_KEY);
      if (!dataUrl) return null;
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      promptBlobRef.current = blob;
      return blob;
    } catch {
      return null;
    }
  }, []);

  const speak = useCallback(async (text: string) => {
    setError(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // CRITICAL: Create Audio element synchronously inside the user gesture.
    // Mobile browsers (iOS Safari, WeChat) require play() to be tied to a
    // direct user gesture; any await before `new Audio()` breaks the chain.
    const audio = new Audio();
    audioRef.current = audio;
    // Prime the element within gesture context so later .play() is allowed
    try {
      audio.muted = true;
      const primePromise = audio.play();
      if (primePromise && typeof primePromise.catch === 'function') {
        primePromise.catch(() => undefined);
      }
      audio.pause();
      audio.muted = false;
      audio.currentTime = 0;
    } catch {
      /* ignore prime errors */
    }

    try {
      setIsSpeaking(true);

      const storedPromptBlob = await getPromptBlob();
      const promptText = localStorage.getItem(PROMPT_TEXT_KEY) || '';

      let response: Response;

      const apiBase = import.meta.env.VITE_WORKER_API_URL || '';

      if (storedPromptBlob) {
        let promptBlob: Blob;
        try {
          // Force re-decode + re-encode every time to guarantee a clean RIFF/WAV
          promptBlob = await normalizePromptAudio(storedPromptBlob);
          // Double check: must have RIFF/WAVE header now
          if (!(await hasWavHeader(promptBlob))) {
            throw new Error('encode failed');
          }
        } catch {
          clearPromptAudio();
          throw new Error('参考音频格式无效，请删除当前音色并重新录制');
        }

        if (promptBlob !== storedPromptBlob || storedPromptBlob.type !== 'audio/wav') {
          await persistPromptAudio(promptBlob, promptText || undefined);
          promptBlobRef.current = promptBlob;
        }

        const formData = new FormData();
        formData.append('tts_text', text);
        formData.append('prompt_text', promptText);
        formData.append('prompt_wav', promptBlob, 'prompt.wav');

        response = await fetch(`${apiBase}/api/cosyvoice-tts`, {
          method: 'POST',
          body: formData,
        });
      } else {
        response = await fetch(`${apiBase}/api/cosyvoice-tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `TTS 请求失败 (${response.status})`);
      }

      const responseContentType = response.headers.get('content-type') || '';
      if (responseContentType.includes('application/json')) {
        const errData = await response.json();
        if (errData.ok === false) {
          throw new Error(errData.error || 'TTS 服务暂时不可用');
        }
        throw new Error(errData.error || '未知错误');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      audio.src = audioUrl;
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };

      try {
        await audio.play();
      } catch (playErr) {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        const msg = playErr instanceof Error ? playErr.message : '';
        if (msg.includes('user gesture') || msg.includes('not allowed') || msg.includes('NotAllowed')) {
          throw new Error('请在页面上轻触一下后再点朗读（浏览器要求用户手势）');
        }
        throw playErr;
      }
    } catch (err) {
      setIsSpeaking(false);
      const message = err instanceof Error ? err.message : 'TTS 播放失败';
      setError(message);
    }
  }, [clearPromptAudio, getPromptBlob, persistPromptAudio]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
    setError(null);
  }, []);

  return {
    speak,
    stop,
    isSpeaking,
    setPromptAudio,
    clearPromptAudio,
    hasPromptAudio,
    error,
  };
}