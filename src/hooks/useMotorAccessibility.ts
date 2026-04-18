import { useCallback, useRef } from 'react';

/**
 * Hook that provides click debouncing for users with motor impairments.
 * Prevents accidental double-clicks caused by hand tremors.
 * 
 * @param handler - The function to call on debounced click
 * @param delayMs - Minimum delay between clicks (default 300ms)
 */
export function useDebouncedClick<T extends (...args: any[]) => any>(
  handler: T,
  delayMs: number = 300
): T {
  const lastClickRef = useRef(0);

  return useCallback(
    ((...args: any[]) => {
      const now = Date.now();
      if (now - lastClickRef.current < delayMs) return;
      lastClickRef.current = now;
      return handler(...args);
    }) as T,
    [handler, delayMs]
  );
}

/**
 * Hook that provides dwell-to-click functionality.
 * When user hovers over an element for a specified duration, it auto-clicks.
 * Designed for users who cannot reliably click a mouse button.
 * 
 * @param onActivate - Function to call when dwell completes
 * @param dwellMs - How long to hover before activation (default 800ms)
 * @param enabled - Whether dwell-to-click is active
 */
export function useDwellClick(
  onActivate: () => void,
  dwellMs: number = 800,
  enabled: boolean = false
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);

  const onMouseEnter = useCallback(() => {
    if (!enabled) return;

    // Start progress animation
    if (progressRef.current) {
      progressRef.current.style.transition = `width ${dwellMs}ms linear`;
      progressRef.current.style.width = '100%';
    }

    timerRef.current = setTimeout(() => {
      onActivate();
      // Reset progress
      if (progressRef.current) {
        progressRef.current.style.transition = 'none';
        progressRef.current.style.width = '0%';
      }
    }, dwellMs);
  }, [onActivate, dwellMs, enabled]);

  const onMouseLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // Reset progress
    if (progressRef.current) {
      progressRef.current.style.transition = 'width 150ms ease-out';
      progressRef.current.style.width = '0%';
    }
  }, []);

  return {
    dwellProps: enabled
      ? { onMouseEnter, onMouseLeave }
      : {},
    progressRef,
  };
}
