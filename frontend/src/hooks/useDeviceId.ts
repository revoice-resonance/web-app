/**
 * Device ID hook — stable browser fingerprint for anonymous session continuity.
 *
 * Uses FingerprintJS to compute a visitorId, cached in localStorage so the
 * same browser consistently returns the same ID across visits. Falls back to
 * a random UUID (via crypto.randomUUID) if FingerprintJS fails to load or
 * execute.
 *
 * Return shape: { deviceId, isLoading }, following the convention established
 * by useAuth (useState + useEffect with cancelled guard, mount-only effect).
 */

import { useState, useEffect } from 'react';

const CACHE_KEY = 'resonance_device_id';

interface UseDeviceIdReturn {
  deviceId: string | null;
  isLoading: boolean;
}

export function useDeviceId(): UseDeviceIdReturn {
  const [deviceId, setDeviceId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CACHE_KEY);
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(!deviceId);

  useEffect(() => {
    if (deviceId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    import('@fingerprintjs/fingerprintjs')
      .then(({ default: FingerprintJS }) => FingerprintJS.load())
      .then((fp) => fp.get())
      .then((result) => {
        if (cancelled) return;
        const id = result.visitorId;
        try {
          localStorage.setItem(CACHE_KEY, id);
        } catch {
          /* ignore */
        }
        setDeviceId(id);
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        const id = crypto.randomUUID();
        try {
          localStorage.setItem(CACHE_KEY, id);
        } catch {
          /* ignore */
        }
        setDeviceId(id);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  return { deviceId, isLoading };
}
