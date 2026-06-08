import { useCosyVoiceTTS } from '@/hooks/useCosyVoiceTTS';
import { useStepFunTTS } from '@/hooks/useStepFunTTS';
import UsagePage from './UsagePage';

const Index = () => {
  // 朗读走阶跃星辰 StepFun 云端 TTS（稳定、不依赖 X1 在线）
  const stepfun = useStepFunTTS({ voice: 'wenrounvsheng' });

  // 保留 CosyVoice 仅用于「保存/清除参考音色」UI 的状态管理，
  // 实际朗读不走 CosyVoice。后续如要做「我的音色」二期，再切回 cosy.speak。
  const cosy = useCosyVoiceTTS();

  return (
    <UsagePage
      onSpeak={stepfun.speak}
      onStop={stepfun.stop}
      isSpeaking={stepfun.isSpeaking}
      hasPromptAudio={cosy.hasPromptAudio}
      ttsError={stepfun.error}
      onSetPromptAudio={cosy.setPromptAudio}
      onClearPromptAudio={cosy.clearPromptAudio}
    />
  );
};

export default Index;
