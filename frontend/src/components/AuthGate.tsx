import { Suspense, lazy } from 'react';
import { useDeviceId } from '@/hooks/useDeviceId';
import { useAuth } from '@/hooks/useAuth';
import { DelayedSkeleton } from '@/components/DelayedSkeleton';

/**
 * AuthGate — wraps useDeviceId + useAuth to gate the app behind
 * authentication. Renders a loading skeleton, the login page, or
 * children depending on auth state.
 */

const LoginPage = lazy(() => import('@/pages/LoginPage'));

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const { deviceId, isLoading: deviceLoading } = useDeviceId();
  const auth = useAuth(deviceId);

  // Auth gate: show skeleton while checking session or loading deviceId
  if (auth.status === 'loading' || deviceLoading) {
    return <DelayedSkeleton variant="page" />;
  }

  if (auth.status === 'guest') {
    return (
      <Suspense fallback={<DelayedSkeleton variant="page" />}>
        <LoginPage onBindPhone={auth.bindPhone} />
      </Suspense>
    );
  }

  return <>{children}</>;
}