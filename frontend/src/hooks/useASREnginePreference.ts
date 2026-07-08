import { useState, useEffect, useCallback } from 'react';

export type ASREnginePreference = 'auto' | 'cloud' | 'browser';

const STORAGE_KEY = 'resonance_asr_engine_pref';

/**
 * Persisted user preference for which ASR engine to use.
 * - 'auto'    → run the Cloud → Browser fallback chain (default)
 * - 'cloud'   → only call cloud ASR (fail loudly, no fallback)
 * - 'browser' → only use the browser's Web Speech API (live recognition)
 *
 * Migration: stored values of 'whisper' or 'gemini' (from
 * previous engine chains) are silently reset to 'auto'.
 */
export function useASREnginePreference() {
  const [preference, setPreferenceState] = useState<ASREnginePreference>('auto');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // Accept current or legacy values and migrate
      if (stored === 'auto' || stored === 'cloud' || stored === 'browser') {
        setPreferenceState(stored);
      } else if (stored === 'whisper' || stored === 'gemini') {
        // Old engines — reset to auto so the user gets
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
