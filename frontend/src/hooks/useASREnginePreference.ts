import { useState, useEffect, useCallback } from 'react';

export type ASREnginePreference = 'auto' | 'cloud-speech' | 'browser';

const STORAGE_KEY = 'resonance_asr_engine_pref';

/**
 * Persisted user preference for which ASR engine to use.
 * - 'auto'     → run the CloudSpeech → Browser fallback chain (default)
 * - 'cloud-speech'  → only call CloudSpeech ASR (fail loudly, no fallback)
 * - 'browser'  → only use the browser's Web Speech API (live recognition)
 *
 * Migration: stored values of 'whisper' or 'gemini' (from the deprecated
 * 3-engine chain) are silently reset to 'auto'.
 */
export function useASREnginePreference() {
  const [preference, setPreferenceState] = useState<ASREnginePreference>('auto');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // Migrate legacy 'whisper'/'gemini' preferences to 'auto'
      if (stored === 'auto' || stored === 'cloud-speech' || stored === 'browser') {
        setPreferenceState(stored);
      } else if (stored === 'whisper' || stored === 'gemini') {
        // Old engines are deprecated — reset to auto so the user gets
        // the current fallback chain without disruption.
        setPreferenceState('auto');
        localStorage.setItem(STORAGE_KEY, 'auto');
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
