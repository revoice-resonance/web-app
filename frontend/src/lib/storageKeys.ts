/** Shared localStorage keys used across hooks. Single source of truth. */
export const PHRASES_KEY = 'resonance_phrases';
export const RECORDINGS_KEY = 'resonance_recordings';
export const SETTINGS_KEY = 'resonance_settings';
export const TTS_VOICE_KEY = 'resonance_tts_voice';
export const ONBOARDING_KEY = 'resonance_onboarding_done';

/** Serializable recording shape persisted to localStorage. */
export interface StoredRecording {
  id: string;
  phraseId: string;
  dataUrl: string;
  duration: number;
  timestamp: number;
}

/** Deserialize stored recordings into Recording objects with real Blobs. */
export function deserializeRecordings(
  stored: StoredRecording[],
  dataUrlToBlob: (dataUrl: string) => Blob,
) {
  return stored.map((r) => ({
    id: r.id,
    phraseId: r.phraseId,
    blob: dataUrlToBlob(r.dataUrl),
    duration: r.duration,
    timestamp: r.timestamp,
  }));
}