import { useState, useEffect, useCallback } from 'react';
import { Phrase } from '@/types';
import { defaultPhrases } from '@/data/defaultPhrases';
import { dataUrlToBlob } from '@/lib/blobUtils';
import { PHRASES_KEY, RECORDINGS_KEY, StoredRecording, deserializeRecordings } from '@/lib/storageKeys';

export function usePhrases() {
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const reloadPhrasesFromStorage = (storedRecordings: StoredRecording[]) => {
    const storedPhrases = localStorage.getItem(PHRASES_KEY);
    if (storedPhrases) {
      const parsed = JSON.parse(storedPhrases) as Phrase[];
      setPhrases(
        parsed.map((p) => {
          const phraseRecordings = storedRecordings.filter((r) => r.phraseId === p.id);
          return {
            ...p,
            recordings: deserializeRecordings(phraseRecordings, dataUrlToBlob),
            recordingCount: phraseRecordings.length,
          };
        })
      );
    } else {
      setPhrases(defaultPhrases);
    }
  };

  // Load phrases on mount, merging recording counts from stored recordings
  useEffect(() => {
    try {
      const storedRecordings = localStorage.getItem(RECORDINGS_KEY);
      const recordings: StoredRecording[] = storedRecordings ? JSON.parse(storedRecordings) : [];
      reloadPhrasesFromStorage(recordings);
    } catch (e) {
      console.error('Failed to load phrases:', e);
      setPhrases(defaultPhrases);
    }
    setIsLoaded(true);
  }, []);

  // Persist phrases (without blob data)
  useEffect(() => {
    if (!isLoaded) return;
    const toStore = phrases.map((p) => ({
      ...p,
      recordings: [],
    }));
    localStorage.setItem(PHRASES_KEY, JSON.stringify(toStore));
  }, [phrases, isLoaded]);

  // Listen for external changes to recordings or data-clearing events
  useEffect(() => {
    const handleRecordingsChanged = () => {
      try {
        const storedRecordings = localStorage.getItem(RECORDINGS_KEY);
        const recordings: StoredRecording[] = storedRecordings ? JSON.parse(storedRecordings) : [];
        reloadPhrasesFromStorage(recordings);
      } catch (e) {
        console.error('Failed to reload recordings:', e);
      }
    };

    const handleTrainingCleared = () => {
      setPhrases((prev) => prev.map((p) => ({ ...p, recordings: [], recordingCount: 0 })));
    };

    window.addEventListener('resonance:recordings-changed', handleRecordingsChanged);
    window.addEventListener('resonance:training-cleared', handleTrainingCleared);
    window.addEventListener('resonance:data-cleared', handleRecordingsChanged);

    return () => {
      window.removeEventListener('resonance:recordings-changed', handleRecordingsChanged);
      window.removeEventListener('resonance:training-cleared', handleTrainingCleared);
      window.removeEventListener('resonance:data-cleared', handleRecordingsChanged);
    };
  }, []);

  const addPhrase = useCallback((text: string, category: string) => {
    const id = `phrase_custom_${Date.now()}`;
    const newPhrase: Phrase = {
      id,
      text,
      category,
      enabled: true,
      recordingCount: 0,
      recordings: [],
      createdAt: Date.now(),
    };
    setPhrases((prev) => [...prev, newPhrase]);
  }, []);

  const updatePhrase = useCallback((id: string, updates: Partial<Phrase>) => {
    setPhrases((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  }, []);

  const deletePhrase = useCallback((id: string) => {
    setPhrases((prev) => prev.filter((p) => p.id !== id));
    try {
      const existing = localStorage.getItem(RECORDINGS_KEY);
      const recordings: StoredRecording[] = existing ? JSON.parse(existing) : [];
      const filtered = recordings.filter((r) => r.phraseId !== id);
      localStorage.setItem(RECORDINGS_KEY, JSON.stringify(filtered));
      window.dispatchEvent(new Event('resonance:recordings-changed'));
    } catch (e) {
      console.error('Error cleaning up recordings:', e);
    }
  }, []);

  return {
    phrases,
    addPhrase,
    updatePhrase,
    deletePhrase,
    isLoaded,
  };
}