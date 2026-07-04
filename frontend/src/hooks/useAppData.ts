import { useState, useEffect, useCallback } from 'react';
import { Phrase, AppSettings, DEFAULT_SETTINGS } from '@/types';
import { defaultPhrases } from '@/data/defaultPhrases';

const PHRASES_KEY = 'resonance_phrases';
const SETTINGS_KEY = 'resonance_settings';
const RECORDINGS_KEY = 'resonance_recordings';

interface StoredRecording {
  id: string;
  phraseId: string;
  dataUrl: string;
  duration: number;
  timestamp: number;
}

export function useAppData() {
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load data on mount
  useEffect(() => {
    try {
      const storedPhrases = localStorage.getItem(PHRASES_KEY);
      const storedSettings = localStorage.getItem(SETTINGS_KEY);

      if (storedPhrases) {
        const parsed = JSON.parse(storedPhrases) as Phrase[];
        // Restore recordings from stored data
        const storedRecordings = localStorage.getItem(RECORDINGS_KEY);
        const recordings: StoredRecording[] = storedRecordings ? JSON.parse(storedRecordings) : [];
        
        const phrasesWithRecordings = parsed.map((p) => ({
          ...p,
          recordings: recordings
            .filter((r) => r.phraseId === p.id)
            .map((r) => ({
              id: r.id,
              phraseId: r.phraseId,
              blob: dataUrlToBlob(r.dataUrl),
              duration: r.duration,
              timestamp: r.timestamp,
            })),
          recordingCount: recordings.filter((r) => r.phraseId === p.id).length,
        }));
        setPhrases(phrasesWithRecordings);
      } else {
        setPhrases(defaultPhrases);
      }

      if (storedSettings) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(storedSettings) });
      }
    } catch (e) {
      console.error('Failed to load data:', e);
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

  // Persist settings
  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings, isLoaded]);

  const addRecording = useCallback(async (phraseId: string, blob: Blob, duration: number) => {
    const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const recording = { id, phraseId, blob, duration, timestamp: Date.now() };

    // Store as data URL
    const dataUrl = await blobToDataUrl(blob);
    const stored: StoredRecording = { id, phraseId, dataUrl, duration, timestamp: Date.now() };

    try {
      const existing = localStorage.getItem(RECORDINGS_KEY);
      const recordings: StoredRecording[] = existing ? JSON.parse(existing) : [];
      recordings.push(stored);
      localStorage.setItem(RECORDINGS_KEY, JSON.stringify(recordings));
    } catch (e) {
      console.error('Storage full, clearing old recordings:', e);
    }

    setPhrases((prev) =>
      prev.map((p) =>
        p.id === phraseId
          ? {
              ...p,
              recordings: [...p.recordings, recording],
              recordingCount: p.recordingCount + 1,
            }
          : p
      )
    );
  }, []);

  const deleteRecording = useCallback((phraseId: string, recordingId: string) => {
    try {
      const existing = localStorage.getItem(RECORDINGS_KEY);
      const recordings: StoredRecording[] = existing ? JSON.parse(existing) : [];
      const filtered = recordings.filter((r) => r.id !== recordingId);
      localStorage.setItem(RECORDINGS_KEY, JSON.stringify(filtered));
    } catch (e) {
      console.error('Error deleting recording:', e);
    }

    setPhrases((prev) =>
      prev.map((p) =>
        p.id === phraseId
          ? {
              ...p,
              recordings: p.recordings.filter((r) => r.id !== recordingId),
              recordingCount: Math.max(0, p.recordingCount - 1),
            }
          : p
      )
    );
  }, []);

  const updatePhrase = useCallback((id: string, updates: Partial<Phrase>) => {
    setPhrases((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
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

  const deletePhrase = useCallback((id: string) => {
    setPhrases((prev) => prev.filter((p) => p.id !== id));
    // Also remove recordings
    try {
      const existing = localStorage.getItem(RECORDINGS_KEY);
      const recordings: StoredRecording[] = existing ? JSON.parse(existing) : [];
      const filtered = recordings.filter((r) => r.phraseId !== id);
      localStorage.setItem(RECORDINGS_KEY, JSON.stringify(filtered));
    } catch (e) {
      console.error('Error:', e);
    }
  }, []);

  const clearAllData = useCallback(() => {
    localStorage.removeItem(PHRASES_KEY);
    localStorage.removeItem(RECORDINGS_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    setPhrases(defaultPhrases);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const clearTrainingData = useCallback(() => {
    localStorage.removeItem(RECORDINGS_KEY);
    setPhrases((prev) =>
      prev.map((p) => ({ ...p, recordings: [], recordingCount: 0 }))
    );
  }, []);

  const exportData = useCallback(() => {
    const data = {
      phrases: phrases.map((p) => ({ ...p, recordings: [] })),
      settings,
      version: '1.0',
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resonance_data_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [phrases, settings]);

  const importData = useCallback((jsonString: string) => {
    try {
      const data = JSON.parse(jsonString);
      if (data.phrases) {
        setPhrases(
          data.phrases.map((p: Phrase) => ({
            ...p,
            recordings: [],
            recordingCount: 0,
          }))
        );
      }
      if (data.settings) {
        setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      }
      localStorage.removeItem(RECORDINGS_KEY);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Simulated recognition
  const recognize = useCallback((): { results: Array<{ phraseId: string; text: string; confidence: number }>; isUnknown: boolean } => {
    const trainedPhrases = phrases.filter((p) => p.enabled && p.recordingCount >= 2);

    if (trainedPhrases.length === 0) {
      return { results: [], isUnknown: true };
    }

    // Shuffle and pick top-k
    const shuffled = [...trainedPhrases].sort(() => Math.random() - 0.5);
    const topK = Math.min(settings.topK, shuffled.length);
    const selected = shuffled.slice(0, topK);

    // Generate simulated confidence scores
    const confidences = selected
      .map((p, i) => ({
        phraseId: p.id,
        text: p.text,
        confidence: Math.max(0.3, 0.95 - i * 0.15 - Math.random() * 0.1),
      }))
      .sort((a, b) => b.confidence - a.confidence);

    // Check if should be unknown
    const isUnknown = confidences[0]?.confidence < settings.absThreshold;

    return { results: confidences, isUnknown };
  }, [phrases, settings]);

  return {
    phrases,
    settings,
    setSettings,
    addRecording,
    deleteRecording,
    updatePhrase,
    addPhrase,
    deletePhrase,
    clearAllData,
    clearTrainingData,
    exportData,
    importData,
    recognize,
    isLoaded,
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'audio/webm';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
}
