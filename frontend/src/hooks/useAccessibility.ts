import { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface AccessibilitySettings {
  /** Font scale multiplier: 1 = default, up to 2 */
  fontScale: number;
  /** Reduce motion: 'system' follows OS, 'on' forces reduced, 'off' forces normal */
  reduceMotion: 'system' | 'on' | 'off';
  /** High contrast mode: 'system' follows OS, 'on' forces, 'off' forces normal */
  highContrast: 'system' | 'on' | 'off';
  /** Whether to show focus indicators always (not just on keyboard nav) */
  alwaysShowFocus: boolean;
  /** Large touch target mode: enlarges all interactive elements */
  largeTouchTargets: boolean;
  /** Dwell-to-click: auto-activate on hover after delay (ms), 0 = off */
  dwellTimeMs: number;
  /** Click debounce delay (ms) to prevent accidental double-clicks */
  clickDebounceMs: number;
}

export const DEFAULT_A11Y: AccessibilitySettings = {
  fontScale: 1,
  reduceMotion: 'system',
  highContrast: 'system',
  alwaysShowFocus: false,
  largeTouchTargets: true, // on by default for cerebral palsy users
  dwellTimeMs: 0, // off by default, user can enable
  clickDebounceMs: 0, // off by default
};

const A11Y_KEY = 'resonance_a11y';

interface AccessibilityContextValue {
  settings: AccessibilitySettings;
  update: <K extends keyof AccessibilitySettings>(key: K, value: AccessibilitySettings[K]) => void;
  reset: () => void;
  /** Computed: is motion actually reduced (considering system + user pref) */
  isMotionReduced: boolean;
  /** Computed: is contrast actually high */
  isHighContrast: boolean;
}

export const AccessibilityContext = createContext<AccessibilityContextValue>({
  settings: DEFAULT_A11Y,
  update: () => {},
  reset: () => {},
  isMotionReduced: false,
  isHighContrast: false,
});

export function useAccessibility() {
  return useContext(AccessibilityContext);
}

/**
 * Hook that manages accessibility state and applies CSS classes to <html>.
 * Used by AccessibilityProvider.
 */
export function useAccessibilityState() {
  const [settings, setSettings] = useState<AccessibilitySettings>(() => {
    try {
      const stored = localStorage.getItem(A11Y_KEY);
      return stored ? { ...DEFAULT_A11Y, ...JSON.parse(stored) } : DEFAULT_A11Y;
    } catch {
      return DEFAULT_A11Y;
    }
  });

  // System preference detection
  const [systemReduceMotion, setSystemReduceMotion] = useState(false);
  const [systemHighContrast, setSystemHighContrast] = useState(false);

  useEffect(() => {
    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const contrastMq = window.matchMedia('(prefers-contrast: more)');

    setSystemReduceMotion(motionMq.matches);
    setSystemHighContrast(contrastMq.matches);

    const onMotion = (e: MediaQueryListEvent) => setSystemReduceMotion(e.matches);
    const onContrast = (e: MediaQueryListEvent) => setSystemHighContrast(e.matches);

    motionMq.addEventListener('change', onMotion);
    contrastMq.addEventListener('change', onContrast);
    return () => {
      motionMq.removeEventListener('change', onMotion);
      contrastMq.removeEventListener('change', onContrast);
    };
  }, []);

  // Computed values
  const isMotionReduced =
    settings.reduceMotion === 'on' ||
    (settings.reduceMotion === 'system' && systemReduceMotion);

  const isHighContrast =
    settings.highContrast === 'on' ||
    (settings.highContrast === 'system' && systemHighContrast);

  // Apply classes to <html>
  useEffect(() => {
    const html = document.documentElement;

    // Font scale via CSS custom property
    html.style.setProperty('--font-scale', String(settings.fontScale));
    html.style.fontSize = `${settings.fontScale * 100}%`;

    // Motion
    html.classList.toggle('reduce-motion', isMotionReduced);

    // Contrast
    html.classList.toggle('high-contrast', isHighContrast);

    // Focus
    html.classList.toggle('always-show-focus', settings.alwaysShowFocus);

    // Large targets
    html.classList.toggle('large-targets', settings.largeTouchTargets);
  }, [settings, isMotionReduced, isHighContrast]);

  // Persist
  useEffect(() => {
    localStorage.setItem(A11Y_KEY, JSON.stringify(settings));
  }, [settings]);

  const update = useCallback(<K extends keyof AccessibilitySettings>(key: K, value: AccessibilitySettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_A11Y);
  }, []);

  return {
    settings,
    update,
    reset,
    isMotionReduced,
    isHighContrast,
  };
}
