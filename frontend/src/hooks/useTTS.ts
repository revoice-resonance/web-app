import { useState, useEffect, useCallback, useRef } from 'react';

interface UseTTSReturn {
  speak: (text: string) => void;
  stop: () => void;
  isSpeaking: boolean;
  voices: SpeechSynthesisVoice[];
  hasChineseVoice: boolean;
  isSupported: boolean;
}

const isSpeechSynthesisSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

export function useTTS(rate = 1, volume = 1, pitch = 1, voiceURI = ''): UseTTSReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [hasChineseVoice, setHasChineseVoice] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (!isSpeechSynthesisSupported) return;
    const loadVoices = () => {
      const v = speechSynthesis.getVoices();
      setVoices(v);
      setHasChineseVoice(v.some((voice) => voice.lang.startsWith('zh')));
    };
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
    return () => { speechSynthesis.onvoiceschanged = null; };
  }, []);

  const speak = useCallback((text: string) => {
    if (!isSpeechSynthesisSupported) {
      console.warn('[TTS] speechSynthesis not supported in this browser');
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.volume = volume;
    utterance.pitch = pitch;
    utterance.lang = 'zh-CN';

    if (voiceURI) {
      const voice = voices.find((v) => v.voiceURI === voiceURI);
      if (voice) utterance.voice = voice;
    } else {
      const zhVoice = voices.find((v) => v.lang.startsWith('zh'));
      if (zhVoice) utterance.voice = zhVoice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    utteranceRef.current = utterance;
    speechSynthesis.speak(utterance);
  }, [rate, volume, pitch, voiceURI, voices]);

  const stop = useCallback(() => {
    if (!isSpeechSynthesisSupported) return;
    speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  return { speak, stop, isSpeaking, voices, hasChineseVoice, isSupported: isSpeechSynthesisSupported };
}
