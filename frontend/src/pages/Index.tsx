import { useState, useCallback } from 'react';
import { useCloudTTS, type CloudVoice } from '@/hooks/useCloudTTS';
import UsagePage from './UsagePage';
import VoiceSelector from '@/components/VoiceSelector';

/** localStorage key for persisting selected voice across sessions. */
const STORAGE_KEY = 'resonance_tts_voice';

/**
 * Read the persisted voice from localStorage on initial mount.
 * Falls back to 'wenrounvsheng' (温柔女声) when no value is stored.
 * Migrates from legacy key 'resonance_cloud-speech_voice'.
 */
function loadInitialVoice(): CloudVoice {
  try {
    // Try new key first
    let saved = localStorage.getItem(STORAGE_KEY);
    // Migrate from legacy key
    if (!saved) {
      saved = localStorage.getItem('resonance_cloud-speech_voice');
      if (saved) {
        localStorage.setItem(STORAGE_KEY, saved);
        localStorage.removeItem('resonance_cloud-speech_voice');
      }
    }
    if (saved) return saved as CloudVoice;
  } catch {
    /* storage unavailable — use default */
  }
  return 'wenrounvsheng';
}

const Index = () => {
  const [selectedVoice, setSelectedVoice] = useState<CloudVoice>(loadInitialVoice);
  const [isTestSpeaking, setIsTestSpeaking] = useState(false);

  // Cloud TTS as primary speech engine
  const cloud = useCloudTTS({ voice: 'wenrounvsheng' });

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
