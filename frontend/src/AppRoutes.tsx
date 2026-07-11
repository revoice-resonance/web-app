import { Routes, Route } from 'react-router-dom';
import { usePhrases } from '@/hooks/usePhrases';
import { useSettings } from '@/hooks/useSettings';
import { useCloudTTS } from '@/hooks/useCloudTTS';
import { useState, lazy, Suspense, useCallback } from 'react';
import { DelayedSkeleton } from '@/components/DelayedSkeleton';
import { AuthGate } from '@/components/AuthGate';
import { OnboardingGate } from '@/components/OnboardingGate';
import { VoiceProvider, useVoice } from '@/components/VoiceProvider';
import UsagePage from './pages/UsagePage';
import VoiceSelector from '@/components/VoiceSelector';

const TrainingPage = lazy(() => import('./pages/TrainingPage'));
const PhrasesPage = lazy(() => import('./pages/PhrasesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const NotFound = lazy(() => import('./pages/NotFound'));

/** Inner content that needs voice state from VoiceProvider context. */
function AppRoutesContent() {
  const { selectedVoice, setSelectedVoice } = useVoice();
  const [isTestSpeaking, setIsTestSpeaking] = useState(false);
  const { settings, setSettings } = useSettings();
  const cloud = useCloudTTS({ voice: 'alloy' });

  const handleTestVoice = useCallback(async (text: string) => {
    setIsTestSpeaking(true);
    try {
      await cloud.speak(text, { voice: selectedVoice });
    } finally {
      setIsTestSpeaking(false);
    }
  }, [cloud, selectedVoice]);

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
          <Route path="/training" element={<TrainingPage />} />
          <Route path="/phrases" element={<PhrasesPage />} />
          <Route
            path="/settings"
            element={<SettingsPage settings={settings} onUpdate={setSettings} />}
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </Suspense>
  );
}

export default function AppRoutes() {
  const { isLoaded } = usePhrases();

  return (
    <OnboardingGate isDataLoaded={isLoaded}>
      <AuthGate>
        <VoiceProvider>
          <AppRoutesContent />
        </VoiceProvider>
      </AuthGate>
    </OnboardingGate>
  );
}