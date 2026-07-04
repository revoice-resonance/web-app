import { useEffect, useCallback, useState } from 'react';

export interface ShortcutAction {
  key: string;
  label: string;
  description: string;
  handler: () => void;
  modifier?: 'ctrl' | 'alt' | 'shift';
  enabled?: boolean;
}

/**
 * Keyboard shortcuts hook for accessibility.
 * Designed for users with cerebral palsy who cannot reliably control a mouse.
 * 
 * @param actions - Array of shortcut actions to register
 * @param priority - 'high' uses capture phase (fires first), 'normal' uses bubble phase.
 *   Page-specific shortcuts should use 'high' to override global navigation.
 */
export function useKeyboardShortcuts(actions: ShortcutAction[], priority: 'high' | 'normal' = 'normal') {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if already consumed by a higher-priority handler
      if ((e as any).__shortcutConsumed) return;

      // Don't trigger when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      for (const action of actions) {
        if (action.enabled === false) continue;

        const keyMatch = e.key.toLowerCase() === action.key.toLowerCase();
        const modifierMatch =
          (!action.modifier) ||
          (action.modifier === 'ctrl' && (e.ctrlKey || e.metaKey)) ||
          (action.modifier === 'alt' && e.altKey) ||
          (action.modifier === 'shift' && e.shiftKey);

        // For modifier shortcuts, ensure modifier is pressed
        // For non-modifier shortcuts, ensure NO modifier is pressed
        const noUnwantedModifier = action.modifier
          ? true
          : !e.ctrlKey && !e.metaKey && !e.altKey;

        if (keyMatch && modifierMatch && noUnwantedModifier) {
          e.preventDefault();
          (e as any).__shortcutConsumed = true;
          action.handler();
          return;
        }
      }
    };

    // High priority uses capture phase (fires before bubble)
    const useCapture = priority === 'high';
    window.addEventListener('keydown', handler, useCapture);
    return () => window.removeEventListener('keydown', handler, useCapture);
  }, [actions, priority]);
}

/**
 * Hook to manage keyboard shortcut help panel visibility
 */
export function useShortcutHelpPanel() {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      ) {
        return;
      }

      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        toggle();
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        close();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle, close, isOpen]);

  return { isOpen, toggle, close };
}
