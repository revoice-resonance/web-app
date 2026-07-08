import { Routes, Route } from 'react-router-dom';
import { useAppData } from '@/hooks/useAppData';
import { useAuth } from '@/hooks/useAuth';
import { useDeviceId } from '@/hooks/useDeviceId';
import { useCloudTTS, type CloudVoice } from '@/hooks/useCloudTTS';
import { useMemo, useState, useEffect, lazy, Suspense, useCallback } from 'react';
import { DelayedSkeleton } from '@/components/DelayedSkeleton';
import UsagePage from './pages/UsagePage';
import VoiceSelector from '@/components/VoiceSelector';

const TrainingPage = lazy(() => import('./pages/TrainingPage'));
const PhrasesPage = lazy(() => import('./pages/PhrasesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

const WelcomePage = lazy(() => import('./pages/WelcomePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const NotFound = lazy(() => import('./pages/NotFound'));

const ONBOARDING_KEY = 'resonance_onboarding_done';
const STORAGE_KEY = 'resonance_tts_voice';

function loadInitialVoice(): CloudVoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved as CloudVoice;
  } catch { /* ignore */ }
  return 'alloy';
}

export default function AppRoutes() {
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeChecked, setWelcomeChecked] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<CloudVoice>(loadInitialVoice);
  const [isTestSpeaking, setIsTestSpeaking] = useState(false);

  const { deviceId, isLoading: deviceLoading } = useDeviceId();
  const auth = useAuth(deviceId);

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

  // Cloud TTS
  const cloud = useCloudTTS({ voice: 'alloy' });

  const handleTestVoice = useCallback(async (text: string) => {
    setIsTestSpeaking(true);
    try {
      await cloud.speak(text, { voice: selectedVoice });
    } finally {
      setIsTestSpeaking(false);
    }
  }, [cloud, selectedVoice]);

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

  // Auth gate: show skeleton while checking session or loading deviceId
  if (auth.status === 'loading' || deviceLoading) {
    return <DelayedSkeleton variant="page" />;
  }

  if (auth.status === 'guest') {
    return (
      <Suspense fallback={<DelayedSkeleton variant="page" />}>
        <LoginPage onBindPhone={auth.bindPhone} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<DelayedSkeleton variant="page" />}>
      <div className="space-y-5">
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
