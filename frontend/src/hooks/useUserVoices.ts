/**
 * useUserVoices — user voice data hook.
 *
 * Manages cloned voice records across auth states:
 * - Authenticated: fetches from /api/user/voices, persists via POST
 * - Guest: falls back to localStorage under key 'resonance_user_voices'
 * - On guest→authenticated transition: syncs localStorage voices to server,
 *   clears localStorage, and refreshes the server list.
 *
 * Consumes useAuth() for status + userId; follows the codebase convention
 * of raw fetch() calls with credentials: 'include'.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import type { UserVoice } from '@/types/auth';
import { toast } from 'sonner';
import { api } from '@/lib/api';

/** localStorage key for guest-mode voice data. */
const LOCAL_KEY = 'resonance_user_voices';

/** Load guest voices from localStorage. Returns [] on any failure. */
function loadLocalVoices(): UserVoice[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as UserVoice[]) : [];
  } catch {
    return [];
  }
}

/** Persist guest voices to localStorage. Silently no-ops on failure. */
function saveLocalVoices(voices: UserVoice[]): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(voices));
  } catch {
    /* storage unavailable — non-critical */
  }
}

/** Remove guest voice data from localStorage. */
function clearLocalVoices(): void {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Hook return shape.
 *
 * - `userVoices`: current voice list (server when authenticated, localStorage when guest)
 * - `isLoading`: true while the initial fetch is in flight
 * - `addVoice`: persists a voice (API when authenticated, localStorage when guest)
 */
export function useUserVoices() {
  const { status, userId } = useAuth();
  const [userVoices, setUserVoices] = useState<UserVoice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSynced, setHasSynced] = useState(false);

  // Fetch voices when authenticated; load from localStorage when guest.
  useEffect(() => {
    if (status !== 'authenticated') {
      setUserVoices(loadLocalVoices());
      setHasSynced(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    api.userVoices
      .list(50)
      .then((data) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.voices)) {
          setUserVoices(data.voices);
        }
      })
      .catch(() => {
        /* network error — keep existing state */
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, userId]);

  // Sync localStorage voices to server on first authentication.
  useEffect(() => {
    if (status !== 'authenticated' || hasSynced) return;

    const local = loadLocalVoices();
    if (local.length === 0) {
      setHasSynced(true);
      return;
    }

    api.userVoices
      .sync(local)
      .then((data) => {
        if (data.ok && Array.isArray(data.voices)) {
          setUserVoices(data.voices);
          clearLocalVoices();
        }
      })
      .catch(() => {
        /* network error — retry next auth transition */
      })
      .finally(() => setHasSynced(true));
  }, [status, hasSynced]);

  /**
   * Persist a voice. When authenticated, POSTs to the API and refreshes
   * the list. When guest, prepends to localStorage and shows a sync hint.
   */
  const addVoice = useCallback(
    async (voiceId: string, label?: string) => {
      if (status === 'authenticated') {
        try {
          const res = await api.userVoices.create(voiceId, label || null);
          if (res.ok) {
            // Refresh the full list so the UI stays in sync.
            const listData = await api.userVoices.list(50);
            if (listData.ok) setUserVoices(listData.voices);
            return;
          }
        } catch {
          /* fall through to local fallback */
        }
      }

      // Guest mode: save to localStorage.
      const newVoice: UserVoice = {
        voice_id: voiceId,
        label: label || null,
        created_at: new Date().toISOString(),
      };
      const updated = [
        newVoice,
        ...loadLocalVoices().filter((v) => v.voice_id !== voiceId),
      ];
      saveLocalVoices(updated);
      setUserVoices(updated);
      toast.success('音色已保存', {
        description: '登录后可跨设备同步',
      });
    },
    [status],
  );

  return { userVoices, isLoading, addVoice };
}
