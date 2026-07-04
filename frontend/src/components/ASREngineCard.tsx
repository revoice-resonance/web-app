import { useEffect, useState } from 'react';
import { Sparkles, Cloud, Globe, Loader2, CheckCircle2, AlertCircle, Zap } from 'lucide-react';
import { useASREnginePreference, type ASREnginePreference } from '@/hooks/useASREnginePreference';

type ServiceStatus = 'checking' | 'online' | 'offline';

interface EngineOption {
  key: ASREnginePreference;
  title: string;
  subtitle: string;
  description: string;
  Icon: typeof Sparkles;
}

const OPTIONS: EngineOption[] = [
  {
    key: 'auto',
    title: '智能模式',
    subtitle: '推荐',
    description: 'CloudSpeech → 浏览器，按顺序自动回退，最稳定',
    Icon: Sparkles,
  },
  {
    key: 'cloud-speech',
    title: '阶跃星辰',
    subtitle: '云端主路',
    description: '阶跃星辰 ASR，快速准确',
    Icon: Cloud,
  },
  {
    key: 'browser',
    title: '浏览器内置',
    subtitle: '本机识别',
    description: '强制只用浏览器原生识别，离线可用，准确率较低',
    Icon: Globe,
  },
];

/**
 * Large visual card for picking the ASR engine.
 *
 * - Header shows live CloudSpeech key-presence health check.
 * - Body is a grid of engine choices, each a sizable
 *   tappable tile with icon + title + description (motor-accessible).
 */
export default function ASREngineCard() {
  const { preference, setPreference } = useASREnginePreference();
  const [status, setStatus] = useState<ServiceStatus>('checking');
  const [statusLabel, setStatusLabel] = useState('检测中…');

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const apiBase = import.meta.env.VITE_WORKER_API_URL || '';
        const res = await fetch(`${apiBase}/api/cloud-speech/health`);
        if (cancelled) return;
        if (res.ok) {
          setStatus('online');
          setStatusLabel('CloudSpeech 已配置');
        } else {
          setStatus('offline');
          setStatusLabel('CloudSpeech 待配置');
        }
      } catch {
        if (!cancelled) {
          setStatus('offline');
          setStatusLabel('CloudSpeech 暂不可用');
        }
      }
    };
    check();
    return () => { cancelled = true; };
  }, []);

  const statusBadge = {
    checking: { label: statusLabel, Icon: Loader2, cls: 'text-muted-foreground bg-muted', spin: true },
    online: { label: statusLabel, Icon: CheckCircle2, cls: 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30', spin: false },
    offline: { label: statusLabel, Icon: AlertCircle, cls: 'text-yellow-700 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30', spin: false },
  }[status];

  const StatusIcon = statusBadge.Icon;

  return (
    <div className="rounded-2xl border border-border bg-gradient-to-br from-card to-card/70 p-5 md:p-6 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-accent/15">
            <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-base">语音识别引擎</h3>
            <p className="text-xs text-muted-foreground">选择哪种方式将您的语音转为文字</p>
          </div>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${statusBadge.cls}`}>
          <StatusIcon className={`h-3 w-3 ${statusBadge.spin ? 'animate-spin' : ''}`} aria-hidden="true" />
          {statusBadge.label}
        </span>
      </div>

      {/* Engine grid */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        role="radiogroup"
        aria-label="选择语音识别引擎"
      >
        {OPTIONS.map((opt) => {
          const active = preference === opt.key;
          const Icon = opt.Icon;
          return (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPreference(opt.key)}
              className={`a11y-target relative text-left rounded-xl border-2 p-4 transition-all min-h-[96px] ${
                active
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30'
              }`}
            >
              {active && (
                <span className="absolute top-2 right-2 inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              )}
              <div className="flex items-center gap-2.5 mb-1.5">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{opt.title}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {opt.subtitle}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {opt.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
