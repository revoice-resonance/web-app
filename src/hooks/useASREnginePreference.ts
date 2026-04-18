import { useState, useEffect, useCallback } from 'react';

export type ASREnginePreference = 'auto' | 'whisper' | 'gemini' | 'browser';

const STORAGE_KEY = 'resonance_asr_engine_pref';

/**
 * Persisted user preference for which ASR engine to use.
 * - 'auto'    → run the full Whisper → Gemini → Browser fallback chain (default)
 * - 'whisper' → only call self-hosted Whisper (fail loudly, no fallback)
 * - 'gemini'  → only call Gemini ASR edge function
 * - 'browser' → only use the browser's Web Speech API (live recognition)
 */
export function useASREnginePreference() {
  const [preference, setPreferenceState] = useState<ASREnginePreference>('auto');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'auto' || stored === 'whisper' || stored === 'gemini' || stored === 'browser') {
        setPreferenceState(stored);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setPreference = useCallback((next: ASREnginePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  return { preference, setPreference };
}
