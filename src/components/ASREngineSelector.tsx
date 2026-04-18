import { Sparkles, Cpu, Cloud, Globe } from 'lucide-react';
import type { ASREnginePreference } from '@/hooks/useASREnginePreference';

interface ASREngineSelectorProps {
  value: ASREnginePreference;
  onChange: (next: ASREnginePreference) => void;
  className?: string;
}

const OPTIONS: Array<{
  key: ASREnginePreference;
  label: string;
  hint: string;
  Icon: typeof Sparkles;
}> = [
  { key: 'auto', label: '智能', hint: '智能：三层自动回退（推荐）', Icon: Sparkles },
  { key: 'whisper', label: 'Whisper', hint: 'Whisper：只用自建主路', Icon: Cpu },
  { key: 'gemini', label: 'Gemini', hint: 'Gemini：只用云端模型', Icon: Cloud },
  { key: 'browser', label: '浏览器', hint: '浏览器：只用本机引擎', Icon: Globe },
];

/**
 * Compact icon-only segmented control for picking the ASR engine.
 * Active option also shows its label; inactive options are icon-only
 * to keep the control unobtrusive on the recording screen.
 */
export default function ASREngineSelector({
  value,
  onChange,
  className = '',
}: ASREngineSelectorProps) {
  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-lg border border-border/50 bg-muted/20 p-0.5 ${className}`}
      role="radiogroup"
      aria-label="选择语音识别引擎"
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.Icon;
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.hint}
            onClick={() => onChange(opt.key)}
            title={opt.hint}
            className={`inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all min-h-[28px] ${
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            }`}
          >
            <Icon className="h-3 w-3" aria-hidden="true" />
            {active && <span className="whitespace-nowrap">{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
