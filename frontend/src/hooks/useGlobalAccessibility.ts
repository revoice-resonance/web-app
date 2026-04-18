import { useEffect, useRef } from 'react';
import { useAccessibility } from './useAccessibility';

const INTERACTIVE_SELECTOR = 'button, a, [role="button"], [role="switch"], [role="tab"], [role="link"], input[type="submit"], input[type="button"]';

/**
 * Global accessibility effects that apply dwell-to-click and click debounce
 * to ALL interactive elements on the page, without requiring per-component wiring.
 */
export function useGlobalAccessibility() {
  const { settings } = useAccessibility();
  const lastClickTimeRef = useRef(0);
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dwellTargetRef = useRef<HTMLElement | null>(null);
  const progressElRef = useRef<HTMLDivElement | null>(null);

  // === Global Click Debounce ===
  useEffect(() => {
    const debounceMs = settings.clickDebounceMs;
    if (debounceMs <= 0) return;

    const handler = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastClickTimeRef.current < debounceMs) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      lastClickTimeRef.current = now;
    };

    // Capture phase to intercept before any handler
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [settings.clickDebounceMs]);

  // === Global Dwell-to-Click ===
  useEffect(() => {
    const dwellMs = settings.dwellTimeMs;
    if (dwellMs <= 0) {
      // Clean up progress indicator if dwell was just disabled
      progressElRef.current?.remove();
      progressElRef.current = null;
      return;
    }

    function isInteractive(el: EventTarget | null): el is HTMLElement {
      if (!(el instanceof HTMLElement)) return false;
      return el.matches(INTERACTIVE_SELECTOR) || !!el.closest(INTERACTIVE_SELECTOR);
    }

    function getInteractiveTarget(el: EventTarget | null): HTMLElement | null {
      if (!(el instanceof HTMLElement)) return null;
      if (el.matches(INTERACTIVE_SELECTOR)) return el;
      return el.closest<HTMLElement>(INTERACTIVE_SELECTOR);
    }

    function ensureProgressEl(): HTMLDivElement {
      if (!progressElRef.current) {
        const div = document.createElement('div');
        div.className = 'dwell-progress';
        div.setAttribute('aria-hidden', 'true');
        progressElRef.current = div;
      }
      return progressElRef.current;
    }

    function clearDwell() {
      if (dwellTimerRef.current) {
        clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = null;
      }
      const prog = progressElRef.current;
      if (prog && prog.parentElement) {
        prog.style.transition = 'width 120ms ease-out';
        prog.style.width = '0%';
        // Detach after animation
        setTimeout(() => prog.parentElement?.removeChild(prog), 130);
      }
      dwellTargetRef.current = null;
    }

    const onPointerEnter = (e: PointerEvent) => {
      const target = getInteractiveTarget(e.target);
      if (!target || target.getAttribute('aria-disabled') === 'true' || target.hasAttribute('disabled')) return;

      // Ensure target is positioned for the progress bar
      const computed = getComputedStyle(target);
      if (computed.position === 'static') {
        target.style.position = 'relative';
      }

      dwellTargetRef.current = target;

      const prog = ensureProgressEl();
      prog.style.transition = 'none';
      prog.style.width = '0%';
      target.appendChild(prog);

      // Start fill animation next frame
      requestAnimationFrame(() => {
        prog.style.transition = `width ${dwellMs}ms linear`;
        prog.style.width = '100%';
      });

      dwellTimerRef.current = setTimeout(() => {
        target.click();
        clearDwell();
      }, dwellMs);
    };

    const onPointerLeave = (e: PointerEvent) => {
      const target = getInteractiveTarget(e.target);
      if (target && target === dwellTargetRef.current) {
        clearDwell();
      }
    };

    document.addEventListener('pointerenter', onPointerEnter, true);
    document.addEventListener('pointerleave', onPointerLeave, true);

    return () => {
      clearDwell();
      document.removeEventListener('pointerenter', onPointerEnter, true);
      document.removeEventListener('pointerleave', onPointerLeave, true);
    };
  }, [settings.dwellTimeMs]);
}
