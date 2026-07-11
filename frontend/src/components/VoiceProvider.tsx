import { createContext, useContext, useState, useCallback } from 'react';
import type { CloudVoice } from '@/hooks/useCloudTTS';
import { TTS_VOICE_KEY } from '@/lib/storageKeys';

/**
 * VoiceProvider — React Context that owns the selectedVoice state and
 * the 'resonance_tts_voice' localStorage key. This eliminates the
 * localStorage collision between AppRoutes and VoiceSelector.
 *
 * Exports: VoiceProvider component, useVoice() hook.
 * useVoice() returns: { selectedVoice, setSelectedVoice }
 */

/** Read the persisted voice from localStorage on initial mount. */
function loadInitialVoice(): CloudVoice {
  try {
    const saved = localStorage.getItem(TTS_VOICE_KEY);
    if (saved) return saved as CloudVoice;
  } catch {
    /* storage unavailable — use default */
  }
  return 'alloy';
}

interface VoiceContextValue {
  selectedVoice: CloudVoice;
  setSelectedVoice: (voice: CloudVoice) => void;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

/** Hook to access voice state. Must be used within VoiceProvider. */
export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) {
    throw new Error('useVoice must be used within VoiceProvider');
  }
  return ctx;
}

/** Provider that owns selectedVoice state and localStorage persistence. */
export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [selectedVoice, setSelectedVoiceState] = useState<CloudVoice>(loadInitialVoice);

  const setSelectedVoice = useCallback((voice: CloudVoice) => {
    setSelectedVoiceState(voice);
    try {
      localStorage.setItem(TTS_VOICE_KEY, voice);
    } catch {
      /* storage unavailable — non-critical, selection still works in-memory */
    }
  }, []);

  return (
    <VoiceContext.Provider value={{ selectedVoice, setSelectedVoice }}>
      {children}
    </VoiceContext.Provider>
  );
}