import { Cloud, Globe, Check, Loader2 } from 'lucide-react';
import type { ASREngine, ASREngineStage } from '@/types/asrEngine';

interface ASREngineIndicatorProps {
  engine: ASREngine | null;
  stage: ASREngineStage;
  className?: string;
}

type LayerKey = 'cloud' | 'browser';

interface LayerSpec {
  key: LayerKey;
  label: string;
  hint: string;
  Icon: typeof Cloud;
}

const LAYERS: LayerSpec[] = [
  { key: 'cloud', label: '云端', hint: '云端主路', Icon: Cloud },
  { key: 'browser', label: '浏览器', hint: '本机兜底', Icon: Globe },
];

/**
 * Visual indicator that walks the user through the 2-tier ASR fallback chain.
 * State transitions per layer:
 *   - pending: not yet reached (muted)
 *   - active : currently being tried (pulsing primary)
 *   - skipped: a previous layer succeeded above (muted)
 *   - done   : this layer produced the final transcript (success)
 *   - failed : tried and gave up before moving on
 */
function getLayerState(
  layer: LayerKey,
  engine: ASREngine | null,
  stage: ASREngineStage,
): 'pending' | 'active' | 'skipped' | 'done' | 'failed' {
  // Final success — only the engine that won is "done", others are skipped/failed
  if (stage === 'success' && engine) {
    if (layer === engine) return 'done';
    // Layers tried before the winner = failed; layers after = skipped
    const order: LayerKey[] = ['cloud', 'browser'];
    return order.indexOf(layer) < order.indexOf(engine) ? 'failed' : 'skipped';
  }

  if (stage === 'failed') {
    return 'failed';
  }

  if (stage === 'cloud-trying') {
    return layer === 'cloud' ? 'active' : 'pending';
  }
  if (stage === 'browser-trying') {
    if (layer === 'cloud') return 'failed';
    if (layer === 'browser') return 'active';
    return 'pending';
  }

  return 'pending';
}

export default function ASREngineIndicator({
  engine,
  stage,
  className = '',
}: ASREngineIndicatorProps) {
  if (stage === 'idle') return null;

  return (
    <div
      className={`flex items-center justify-between gap-1 rounded-xl border border-border/60 bg-muted/30 px-2 py-1.5 ${className}`}
      role="status"
      aria-live="polite"
      aria-label={
        stage === 'success' && engine
          ? `识别完成，使用 ${LAYERS.find((l) => l.key === engine)?.label} 引擎`
          : '正在识别语音'
      }
    >
      {LAYERS.map((layer, idx) => {
        const state = getLayerState(layer.key, engine, stage);
        const Icon = layer.Icon;

        const baseChip =
          'flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors';
        const stateClass = {
          pending: 'text-muted-foreground/50',
          active: 'bg-primary/10 text-primary',
          skipped: 'text-muted-foreground/40 line-through',
          done: 'bg-success/15 text-success',
          failed: 'text-destructive/60 line-through',
        }[state];

        return (
          <div key={layer.key} className="flex flex-1 items-center gap-1">
            <div className={`${baseChip} ${stateClass} flex-1 justify-center`}>
              {state === 'active' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : state === 'done' ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span className="whitespace-nowrap">{layer.label}</span>
            </div>
            {idx < LAYERS.length - 1 && (
              <span className="text-muted-foreground/30 text-xs" aria-hidden="true">
                →
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
