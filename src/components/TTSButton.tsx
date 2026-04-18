import { Volume2, VolumeX } from 'lucide-react';
import { motion } from 'framer-motion';

interface TTSButtonProps {
  text: string;
  onSpeak: (text: string) => void | Promise<void>;
  onStop: () => void;
  isSpeaking: boolean;
  className?: string;
  shortcutHint?: string;
}

export default function TTSButton({
  text,
  onSpeak,
  onStop,
  isSpeaking,
  className = '',
  shortcutHint,
}: TTSButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={() => (isSpeaking ? onStop() : onSpeak(text))}
      aria-label={isSpeaking ? '停止复述' : '复述该短语'}
      className={`a11y-target inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        isSpeaking
          ? 'bg-accent text-accent-foreground'
          : 'bg-primary text-primary-foreground hover:opacity-90'
      } ${className}`}
    >
      {isSpeaking ? (
        <>
          <VolumeX className="h-4 w-4" />
          停止
        </>
      ) : (
        <>
          <Volume2 className="h-4 w-4" />
          复述
        </>
      )}
      {shortcutHint && <kbd className="kbd-hint ml-1 border-primary-foreground/30 text-primary-foreground/70">{shortcutHint}</kbd>}
    </motion.button>
  );
}
