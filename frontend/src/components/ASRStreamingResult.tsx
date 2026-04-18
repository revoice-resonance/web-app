import { motion } from 'framer-motion';
import { Check, Copy, Volume2, VolumeX, Mic, X } from 'lucide-react';
import { useAccessibility } from '@/hooks/useAccessibility';
import { toast } from 'sonner';

interface ASRStreamingResultProps {
  partialText: string;
  finalText: string;
  onSpeak: (text: string) => void | Promise<void>;
  onStop: () => void;
  isSpeaking: boolean;
  /** Voice clone props */
  hasPromptAudio?: boolean;
  onSaveVoice?: () => void;
  onClearVoice?: () => void;
}

export default function ASRStreamingResult({
  partialText,
  finalText,
  onSpeak,
  onStop,
  isSpeaking,
  hasPromptAudio,
  onSaveVoice,
  onClearVoice,
}: ASRStreamingResultProps) {
  const { isMotionReduced } = useAccessibility();

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success('已复制到剪贴板');
    });
  };

  // Show streaming partial result
  if (!finalText && partialText) {
    return (
      <motion.div
        initial={isMotionReduced ? {} : { opacity: 0, y: 10 }}
        animate={isMotionReduced ? {} : { opacity: 1, y: 0 }}
        className="rounded-xl border border-primary/30 bg-card p-6"
        role="status"
        aria-live="polite"
        aria-label="正在识别中"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
          <span className="text-xs font-medium text-primary">实时识别中</span>
        </div>
        <p className="text-2xl font-bold text-foreground leading-relaxed">
          {partialText}
          <span className="inline-block w-0.5 h-6 bg-primary animate-pulse ml-0.5 align-middle" aria-hidden="true" />
        </p>
      </motion.div>
    );
  }

  // Show final result
  if (finalText) {
    return (
      <motion.div
        initial={isMotionReduced ? {} : { opacity: 0, scale: 0.97 }}
        animate={isMotionReduced ? {} : { opacity: 1, scale: 1 }}
        className="rounded-xl border-2 border-success bg-card p-6"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-success">
            <Check className="h-4 w-4 text-success-foreground" aria-hidden="true" />
          </div>
          <span className="text-sm font-medium text-success">识别完成</span>
        </div>

        <p className="text-3xl font-bold text-foreground mb-6 leading-relaxed">{finalText}</p>

        {/* Voice clone status */}
        {hasPromptAudio && onClearVoice && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-success/15 to-success/5 border border-success/20 px-3 py-1 text-xs font-medium text-success"
          >
            <Check className="h-3.5 w-3.5" />
            音色已保存 · 朗读将使用您的声音
            <button
              onClick={onClearVoice}
              className="ml-0.5 rounded-full p-0.5 text-success/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="清除参考音频"
            >
              <X className="h-3 w-3" />
            </button>
          </motion.div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 flex-wrap">
          {/* Primary: Read Aloud */}
          <button
            onClick={() => (isSpeaking ? onStop() : onSpeak(finalText))}
            className="a11y-target inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
            aria-label={isSpeaking ? '停止朗读' : '朗读识别结果'}
          >
            {isSpeaking ? (
              <VolumeX className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Volume2 className="h-4 w-4" aria-hidden="true" />
            )}
            {isSpeaking ? '停止' : '朗读'}
            <kbd className="kbd-hint border-primary-foreground/30 text-primary-foreground/70" aria-hidden="true">T</kbd>
          </button>

          {/* Save Voice (only if not yet saved) */}
          {!hasPromptAudio && onSaveVoice && (
            <button
              onClick={onSaveVoice}
              className="a11y-target inline-flex items-center gap-2 rounded-xl bg-accent text-accent-foreground px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
              aria-label="保存当前录音为音色"
            >
              <Mic className="h-4 w-4" aria-hidden="true" />
              存为音色
              <kbd className="kbd-hint border-accent-foreground/30 text-accent-foreground/70" aria-hidden="true">S</kbd>
            </button>
          )}

          {/* Copy */}
          <button
            onClick={() => handleCopy(finalText)}
            className="a11y-target inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            aria-label="复制识别结果"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            复制
            <kbd className="kbd-hint" aria-hidden="true">C</kbd>
          </button>
        </div>
      </motion.div>
    );
  }

  return null;
}
