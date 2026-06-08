import { useCosyVoiceTTS } from '@/hooks/useCosyVoiceTTS';
import { useCloudSpeechTTS } from '@/hooks/useCloudSpeechTTS';
import UsagePage from './UsagePage';

const Index = () => {
  // 朗读走阶跃星辰 CloudSpeech 云端 TTS（稳定、不依赖 X1 在线）
  const cloud-speech = useCloudSpeechTTS({ voice: 'wenrounvsheng' });

  // 保留 CosyVoice 仅用于「保存/清除参考音色」UI 的状态管理，
  // 实际朗读不走 CosyVoice。后续如要做「我的音色」二期，再切回 cosy.speak。
  const cosy = useCosyVoiceTTS();

  return (
    <UsagePage
      onSpeak={cloud-speech.speak}
      onStop={cloud-speech.stop}
      isSpeaking={cloud-speech.isSpeaking}
      hasPromptAudio={cosy.hasPromptAudio}
      ttsError={cloud-speech.error}
      onSetPromptAudio={cosy.setPromptAudio}
      onClearPromptAudio={cosy.clearPromptAudio}
    />
  );
};

export default Index;
