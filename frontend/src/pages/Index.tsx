import { useState, useCallback } from 'react';
import { useCloudSpeechTTS, type CloudSpeechVoice } from '@/hooks/useCloudSpeechTTS';
import UsagePage from './UsagePage';
import VoiceSelector from '@/components/VoiceSelector';

/** localStorage key for persisting selected voice across sessions. */
const STORAGE_KEY = 'resonance_cloud-speech_voice';

/**
 * Read the persisted voice from localStorage on initial mount.
 * Falls back to 'wenrounvsheng' (温柔女声) when no value is stored.
 */
function loadInitialVoice(): CloudSpeechVoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved as CloudSpeechVoice;
  } catch {
    /* storage unavailable — use default */
  }
  return 'wenrounvsheng';
}

const Index = () => {
  const [selectedVoice, setSelectedVoice] = useState<CloudSpeechVoice>(loadInitialVoice);
  const [isTestSpeaking, setIsTestSpeaking] = useState(false);

  // 朗读走阶跃星辰 CloudSpeech 云端 TTS（稳定、不依赖 X1 在线）
  const cloud-speech = useCloudSpeechTTS({ voice: 'wenrounvsheng' });

  /** Test-play a sample text with the currently selected voice. */
  const handleTestVoice = useCallback(async (text: string) => {
    setIsTestSpeaking(true);
    try {
      await cloud-speech.speak(text, { voice: selectedVoice });
    } finally {
      setIsTestSpeaking(false);
    }
  }, [cloud-speech, selectedVoice]);

  return (
    <div className="space-y-5">
      {/* Voice selector — replaces deprecated CosyVoice voice-cloning workflow */}
      <section className="max-w-lg mx-auto">
        <VoiceSelector
          selectedVoice={selectedVoice}
          onVoiceChange={setSelectedVoice}
          onTestVoice={handleTestVoice}
          isTestSpeaking={isTestSpeaking}
        />
      </section>

      <UsagePage
        onSpeak={cloud-speech.speak}
        onStop={cloud-speech.stop}
        isSpeaking={cloud-speech.isSpeaking}
        selectedVoice={selectedVoice}
        onVoiceChange={setSelectedVoice}
        ttsError={cloud-speech.error}
      />
    </div>
  );
};

export default Index;
