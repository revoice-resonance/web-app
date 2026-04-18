import { useCosyVoiceTTS } from '@/hooks/useCosyVoiceTTS';
import UsagePage from './UsagePage';

const Index = () => {
  const {
    speak,
    stop,
    isSpeaking,
    setPromptAudio,
    clearPromptAudio,
    hasPromptAudio,
    error: ttsError,
  } = useCosyVoiceTTS();

  return (
    <UsagePage
      onSpeak={speak}
      onStop={stop}
      isSpeaking={isSpeaking}
      hasPromptAudio={hasPromptAudio}
      ttsError={ttsError}
      onSetPromptAudio={setPromptAudio}
      onClearPromptAudio={clearPromptAudio}
    />
  );
};

export default Index;
