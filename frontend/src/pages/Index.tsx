import { useState, useCallback } from 'react';
import { useCloudTTS, type CloudVoice } from '@/hooks/useCloudTTS';
import UsagePage from './UsagePage';
import VoiceSelector from '@/components/VoiceSelector';

/** localStorage key for persisting selected voice across sessions. */
const STORAGE_KEY = 'resonance_tts_voice';

/**
 * Read the persisted voice from localStorage on initial mount.
 * Falls back to 'alloy' (中性女声) when no value is stored.
 */
function loadInitialVoice(): CloudVoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved as CloudVoice;
  } catch {
    /* storage unavailable — use default */
  }
  return 'alloy';
}

const Index = () => {
  const [selectedVoice, setSelectedVoice] = useState<CloudVoice>(loadInitialVoice);
  const [isTestSpeaking, setIsTestSpeaking] = useState(false);

  // CosyVoice TTS as primary speech engine
  const cloud = useCloudTTS({ voice: 'alloy' });

  /** Test-play a sample text with the currently selected voice. */
  const handleTestVoice = useCallback(async (text: string) => {
    setIsTestSpeaking(true);
    try {
      await cloud.speak(text, { voice: selectedVoice });
    } finally {
      setIsTestSpeaking(false);
    }
  }, [cloud, selectedVoice]);

  return (
    <div className="space-y-5">
      {/* Voice selector */}
      <section className="max-w-lg mx-auto">
        <VoiceSelector
          selectedVoice={selectedVoice}
          onVoiceChange={setSelectedVoice}
          onTestVoice={handleTestVoice}
          isTestSpeaking={isTestSpeaking}
        />
      </section>

      <UsagePage
        onSpeak={cloud.speak}
        onStop={cloud.stop}
        isSpeaking={cloud.isSpeaking}
        selectedVoice={selectedVoice}
        onVoiceChange={setSelectedVoice}
        ttsError={cloud.error}
      />
    </div>
  );
};

export default Index;