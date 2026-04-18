import { ReactNode } from 'react';
import { AccessibilityContext, useAccessibilityState } from '@/hooks/useAccessibility';
import { useGlobalAccessibility } from '@/hooks/useGlobalAccessibility';

function AccessibilityEffects() {
  useGlobalAccessibility();
  return null;
}

export default function AccessibilityProvider({ children }: { children: ReactNode }) {
  const a11y = useAccessibilityState();

  return (
    <AccessibilityContext.Provider value={a11y}>
      <AccessibilityEffects />
      {children}
    </AccessibilityContext.Provider>
  );
}
