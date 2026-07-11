/**
 * useCosyVoiceTTS — CosyVoice text-to-speech hook with zero-shot voice cloning.
 *
 * Manages TTS playback via the CosyVoice API endpoints (/api/tts/voices/clone
 * and /api/tts/speak). Supports optional prompt-audio cloning: store a reference
 * audio blob (prompt audio) for zero-shot voice cloning, then send it alongside
 * TTS requests. Prompt audio is persisted to localStorage for cross-session use.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '@/lib/api';

const PROMPT_AUDIO_KEY = 'resonance_prompt_audio';
const PROMPT_TEXT_KEY = 'resonance_prompt_text';

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

/**
 * CosyVoice TTS hook — text-to-speech with optional zero-shot voice cloning.
 */
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
  const promptTextRef = useRef<string>('');

  const setPromptAudio = useCallback((blob: Blob, promptText?: string) => {
    promptBlobRef.current = blob;
    if (promptText) promptTextRef.current = promptText;
    // Also persist as base64 for cross-session usage
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        localStorage.setItem(PROMPT_AUDIO_KEY, reader.result as string);
        if (promptText) {
          localStorage.setItem(PROMPT_TEXT_KEY, promptText);
        }
        setHasPromptAudio(true);
      } catch { /* storage full */ }
    };
    reader.readAsDataURL(blob);
  }, []);

  const clearPromptAudio = useCallback(() => {
    promptBlobRef.current = null;
    promptTextRef.current = '';
    try {
      localStorage.removeItem(PROMPT_AUDIO_KEY);
      localStorage.removeItem(PROMPT_TEXT_KEY);
    } catch { /* ignore */ }
    setHasPromptAudio(false);
  }, []);

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

  // 跨会话首次 speak 前预热：mount 后空闲时解码 localStorage 里的 prompt
  useEffect(() => {
    if (!hasPromptAudio) return;
    const schedule =
      (typeof window !== 'undefined' && window.requestIdleCallback) ||
      ((cb: () => void) => setTimeout(cb, 0));
    const cancel =
      (typeof window !== 'undefined' && window.cancelIdleCallback) ||
      clearTimeout;

    const id = schedule(() => { void getPromptBlob(); });
    try {
      promptTextRef.current = localStorage.getItem(PROMPT_TEXT_KEY) || '';
    } catch { /* ignore */ }

    return () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (cancel as any)(id);
      } catch { /* ignore */ }
    };
  }, [hasPromptAudio, getPromptBlob]);

  const speak = useCallback(async (text: string) => {
    setError(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    try {
      setIsSpeaking(true);

      const promptBlob = await getPromptBlob();
      const promptText =
        promptTextRef.current ||
        localStorage.getItem(PROMPT_TEXT_KEY) ||
        '';

      let audioBlob: Blob;

      if (promptBlob) {
        // Zero-shot mode: send prompt audio with request
        const formData = new FormData();
        formData.append('tts_text', text);
        formData.append('prompt_text', promptText);
        formData.append('prompt_wav', promptBlob, 'prompt.wav');

        audioBlob = await api.tts.speakWithCloneVoice(formData);
      } else {
        // Default mode
        audioBlob = await api.tts.speak({ text });
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
    } catch (err) {
      setIsSpeaking(false);
      const message = err instanceof Error ? err.message : 'TTS 播放失败';
      setError(message);
    }
  }, [getPromptBlob]);

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