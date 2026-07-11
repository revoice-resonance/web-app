import { useState, useEffect, Suspense, lazy } from 'react';
import { DelayedSkeleton } from '@/components/DelayedSkeleton';
import { ONBOARDING_KEY } from '@/lib/storageKeys';

/**
 * OnboardingGate — reads 'resonance_onboarding_done' from localStorage
 * to decide whether to show the 4-step welcome carousel or the main app.
 */

const WelcomePage = lazy(() => import('@/pages/WelcomePage'));

interface OnboardingGateProps {
  /** Whether the core app data has finished loading from localStorage. */
  isDataLoaded: boolean;
  children: React.ReactNode;
}

export function OnboardingGate({ isDataLoaded, children }: OnboardingGateProps) {
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeChecked, setWelcomeChecked] = useState(false);

  useEffect(() => {
    if (isDataLoaded) {
      const done = localStorage.getItem(ONBOARDING_KEY);
      setShowWelcome(!done);
      setWelcomeChecked(true);
    }
  }, [isDataLoaded]);

  const handleOnboardingComplete = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setShowWelcome(false);
  };

  if (!welcomeChecked) {
    return <DelayedSkeleton variant="page" />;
  }

  if (showWelcome) {
    return (
      <Suspense fallback={<DelayedSkeleton variant="page" />}>
        <WelcomePage onComplete={handleOnboardingComplete} />
      </Suspense>
    );
  }

  return <>{children}</>;
}