import { useState, useEffect, useCallback } from 'react';
import { Recording } from '@/types';
import { blobToDataUrl, dataUrlToBlob } from '@/lib/blobUtils';
import { RECORDINGS_KEY, StoredRecording, deserializeRecordings } from '@/lib/storageKeys';

export function useRecordings() {
  const [recordings, setRecordings] = useState<Recording[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECORDINGS_KEY);
      if (stored) {
        setRecordings(deserializeRecordings(JSON.parse(stored) as StoredRecording[], dataUrlToBlob));
      }
    } catch (e) {
      console.error('Failed to load recordings:', e);
    }
  }, []);

  useEffect(() => {
    const handleClear = () => setRecordings([]);
    window.addEventListener('resonance:data-cleared', handleClear);
    window.addEventListener('resonance:training-cleared', handleClear);
    return () => {
      window.removeEventListener('resonance:data-cleared', handleClear);
      window.removeEventListener('resonance:training-cleared', handleClear);
    };
  }, []);

  const addRecording = useCallback(async (phraseId: string, blob: Blob, duration: number) => {
    const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const dataUrl = await blobToDataUrl(blob);
    const timestamp = Date.now();

    const recording: Recording = {
      id,
      phraseId,
      blob,
      duration,
      timestamp,
    };

    try {
      const existing = localStorage.getItem(RECORDINGS_KEY);
      const stored: StoredRecording[] = existing ? JSON.parse(existing) : [];
      stored.push({ id, phraseId, dataUrl, duration, timestamp });
      localStorage.setItem(RECORDINGS_KEY, JSON.stringify(stored));
    } catch (e) {
      console.error('Storage full, clearing old recordings:', e);
    }

    setRecordings((prev) => [...prev, recording]);
    window.dispatchEvent(new Event('resonance:recordings-changed'));
  }, []);

  const deleteRecording = useCallback((phraseId: string, recordingId: string) => {
    try {
      const existing = localStorage.getItem(RECORDINGS_KEY);
      const stored: StoredRecording[] = existing ? JSON.parse(existing) : [];
      const filtered = stored.filter((r) => r.id !== recordingId);
      localStorage.setItem(RECORDINGS_KEY, JSON.stringify(filtered));
    } catch (e) {
      console.error('Error deleting recording:', e);
    }
    setRecordings((prev) => prev.filter((r) => r.id !== recordingId));
    window.dispatchEvent(new Event('resonance:recordings-changed'));
  }, []);

  const clearAllRecordings = useCallback(() => {
    localStorage.removeItem(RECORDINGS_KEY);
    setRecordings([]);
    window.dispatchEvent(new Event('resonance:training-cleared'));
  }, []);

  return {
    recordings,
    addRecording,
    deleteRecording,
    clearAllRecordings,
  };
}