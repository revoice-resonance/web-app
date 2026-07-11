import { useState, useEffect, useCallback } from 'react';
import { AppSettings, DEFAULT_SETTINGS } from '@/types';
import { PHRASES_KEY, SETTINGS_KEY, RECORDINGS_KEY } from '@/lib/storageKeys';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const storedSettings = localStorage.getItem(SETTINGS_KEY);
      if (storedSettings) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(storedSettings) });
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings, isLoaded]);

  const exportData = useCallback(() => {
    const storedPhrases = localStorage.getItem(PHRASES_KEY);
    const phrases = storedPhrases ? JSON.parse(storedPhrases) : [];
    const data = {
      phrases: phrases.map((p: Record<string, unknown>) => ({ ...p, recordings: [] })),
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
  }, [settings]);

  const importData = useCallback((jsonString: string) => {
    try {
      const data = JSON.parse(jsonString);
      if (data.phrases) {
        const phrases = data.phrases.map((p: Record<string, unknown>) => ({
          ...p,
          recordings: [],
          recordingCount: 0,
        }));
        localStorage.setItem(PHRASES_KEY, JSON.stringify(phrases));
      }
      if (data.settings) {
        setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      }
      localStorage.removeItem(RECORDINGS_KEY);
      window.dispatchEvent(new Event('resonance:data-cleared'));
      return true;
    } catch {
      return false;
    }
  }, []);

  const clearAllData = useCallback(() => {
    localStorage.removeItem(PHRASES_KEY);
    localStorage.removeItem(RECORDINGS_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    setSettings(DEFAULT_SETTINGS);
    window.dispatchEvent(new Event('resonance:data-cleared'));
  }, []);

  const clearTrainingData = useCallback(() => {
    localStorage.removeItem(RECORDINGS_KEY);
    window.dispatchEvent(new Event('resonance:training-cleared'));
  }, []);

  return {
    settings,
    setSettings,
    exportData,
    importData,
    clearAllData,
    clearTrainingData,
  };
}