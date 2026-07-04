import { useEffect, useRef } from 'react';

interface AudioSpectrumProps {
  /** Live audio level from useAudioRecorder, typically 0–2 */
  level: number;
  /** Whether recording is active — when false, bars decay to 0 */
  active: boolean;
  /** Number of bars in the visualizer */
  bars?: number;
  className?: string;
}

/**
 * Live audio spectrum visualizer.
 *
 * We don't get raw FFT bins from useAudioRecorder, so we synthesize a rolling
 * spectrum: the latest `level` value gets pushed into a history buffer and
 * each bar is rendered with a small per-bar randomization to feel organic.
 * This gives users immediate visual feedback that audio is being captured.
 */
export default function AudioSpectrum({
  level,
  active,
  bars = 32,
  className = '',
}: AudioSpectrumProps) {
  const historyRef = useRef<number[]>(new Array(bars).fill(0));
  const seedsRef = useRef<number[]>(
    Array.from({ length: bars }, () => 0.6 + Math.random() * 0.6)
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const tick = () => {
      const history = historyRef.current;
      const seeds = seedsRef.current;

      // Push latest level to the front, drop oldest
      history.unshift(active ? Math.min(level, 2) : 0);
      if (history.length > bars) history.length = bars;

      const children = container.children;
      for (let i = 0; i < bars; i++) {
        const raw = history[i] ?? 0;
        // Per-bar variation so the spectrum doesn't look like one flat block
        const variation = active ? seeds[i] : 0;
        const value = Math.min(1, raw * 0.5 * variation);
        // Min 8% so an empty bar is still visible
        const heightPct = active ? Math.max(8, value * 100) : 8;
        const el = children[i] as HTMLElement | undefined;
        if (el) {
          el.style.height = `${heightPct}%`;
          el.style.opacity = active ? `${0.4 + value * 0.6}` : '0.2';
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [level, active, bars]);

  return (
    <div
      ref={containerRef}
      className={`flex h-12 w-full items-end justify-center gap-[3px] px-2 ${className}`}
      role="img"
      aria-label={active ? '正在采集声音' : '未在录音'}
    >
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className="w-1 rounded-full bg-gradient-to-t from-primary via-primary to-accent transition-[height,opacity] duration-75"
          style={{ height: '8%', opacity: 0.2 }}
        />
      ))}
    </div>
  );
}
