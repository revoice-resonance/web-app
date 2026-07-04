import { Routes, Route } from 'react-router-dom';
import { useAppData } from '@/hooks/useAppData';
import { useTTS } from '@/hooks/useTTS';
import { useCloudTTS, type CloudVoice } from '@/hooks/useCloudTTS';
import { useVoiceClone } from '@/hooks/useVoiceClone';
import { useMemo, useState, useEffect, lazy, Suspense, useCallback } from 'react';
import { DelayedSkeleton } from '@/components/DelayedSkeleton';
import UsagePage from './pages/UsagePage';
import VoiceSelector from '@/components/VoiceSelector';
import VoiceClonePanel from '@/components/VoiceClonePanel';

const TrainingPage = lazy(() => import('./pages/TrainingPage'));
const PhrasesPage = lazy(() => import('./pages/PhrasesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

const WelcomePage = lazy(() => import('./pages/WelcomePage'));
const NotFound = lazy(() => import('./pages/NotFound'));

const ONBOARDING_KEY = 'resonance_onboarding_done';
const STORAGE_KEY = 'resonance_tts_voice';
const CLONE_KEY = 'resonance_cloned_voice_id';

function loadInitialVoice(): CloudVoice {
  try {
    let saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      saved = localStorage.getItem('resonance_cloud-speech_voice');
      if (saved) {
        localStorage.setItem(STORAGE_KEY, saved);
        localStorage.removeItem('resonance_cloud-speech_voice');
      }
    }
    if (saved) return saved as CloudVoice;
  } catch { /* ignore */ }
  return 'wenrounvsheng';
}

function loadClonedVoice(): string {
  try {
    return localStorage.getItem(CLONE_KEY) || '';
  } catch { /* ignore */ }
  return '';
}

export default function AppRoutes() {
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeChecked, setWelcomeChecked] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<CloudVoice>(loadInitialVoice);
  const [clonedVoiceId, setClonedVoiceId] = useState<string>(loadClonedVoice);
  const [isTestSpeaking, setIsTestSpeaking] = useState(false);

  const {
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
  } = useAppData();

  useEffect(() => {
    if (isLoaded) {
      const done = localStorage.getItem(ONBOARDING_KEY);
      setShowWelcome(!done);
      setWelcomeChecked(true);
    }
  }, [isLoaded]);

  const handleOnboardingComplete = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setShowWelcome(false);
  };

  const { speak, stop, isSpeaking } = useTTS(
    settings.ttsRate,
    settings.ttsVolume,
    settings.ttsPitch,
    settings.ttsVoice
  );

  // Cloud TTS
  const cloud = useCloudTTS({ voice: 'wenrounvsheng' });

  // Voice clone
  const { clone, isCloning, error: cloneError } = useVoiceClone();

  const handleTestVoice = useCallback(async (text: string) => {
    setIsTestSpeaking(true);
    try {
      await cloud.speak(text, { voice: selectedVoice });
    } finally {
      setIsTestSpeaking(false);
    }
  }, [cloud, selectedVoice]);

  const handleClone = useCallback(async (audioBlob: Blob, referenceText?: string): Promise<string | null> => {
    const voiceId = await clone(audioBlob, referenceText);
    if (voiceId) {
      try {
        localStorage.setItem(CLONE_KEY, voiceId);
      } catch { /* ignore */ }
      setClonedVoiceId(voiceId);
      setSelectedVoice(voiceId);
      return voiceId;
    }
    return null;
  }, [clone]);

  const handleClearVoice = useCallback(() => {
    setClonedVoiceId('');
    try {
      localStorage.removeItem(CLONE_KEY);
    } catch { /* ignore */ }
  }, []);

  const trainedCount = useMemo(
    () => phrases.filter((p) => p.enabled && p.recordingCount >= 2).length,
    [phrases]
  );

  const totalRecordings = useMemo(
    () => phrases.reduce((sum, p) => sum + p.recordingCount, 0),
    [phrases]
  );

  if (!welcomeChecked) {
    return <DelayedSkeleton variant="page" />;
  }

  if (showWelcome) {
    return (
      <Suspense fallback={<DelayedSkeleton variant="page" />}>
        <WelcomePage onComplete={handleOnboardingComplete} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<DelayedSkeleton variant="page" />}>
      <div className="space-y-5">
        <section className="max-w-lg mx-auto">
          <VoiceClonePanel
            voiceId={clonedVoiceId}
            isCloning={isCloning}
            error={cloneError}
            onClone={handleClone}
            onSpeak={cloud.speak}
            onClearVoice={handleClearVoice}
            isSpeaking={isSpeaking}
            onStop={cloud.stop}
          />
        </section>

        <section className="max-w-lg mx-auto">
          <VoiceSelector
            selectedVoice={selectedVoice}
            onVoiceChange={setSelectedVoice}
            onTestVoice={handleTestVoice}
            isTestSpeaking={isTestSpeaking}
          />
        </section>

        <Routes>
          <Route
            path="/"
            element={
              <UsagePage
                onSpeak={cloud.speak}
                onStop={cloud.stop}
                isSpeaking={cloud.isSpeaking}
                selectedVoice={selectedVoice}
                onVoiceChange={setSelectedVoice}
                ttsError={cloud.error}
              />
            }
          />
          <Route
            path="/training"
            element={
              <TrainingPage
                phrases={phrases}
                onAddRecording={addRecording}
                onDeleteRecording={deleteRecording}
              />
            }
          />
          <Route
            path="/phrases"
            element={
              <PhrasesPage
                phrases={phrases}
                onUpdate={updatePhrase}
                onAdd={addPhrase}
                onDelete={deletePhrase}
                onExport={exportData}
                onImport={importData}
              />
            }
          />
          <Route
            path="/settings"
            element={
              <SettingsPage settings={settings} onUpdate={setSettings} />
            }
          />


          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </Suspense>
  );
}
