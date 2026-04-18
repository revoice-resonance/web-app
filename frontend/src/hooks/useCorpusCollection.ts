import { useCallback } from 'react';

/**
 * Silently collects speech corpus (audio + transcript) to the Tencent Cloud
 * VPS service after each successful ASR recognition.
 *
 * Endpoint: https://corpus.sg.superbrain-ai.com/api/corpus
 * Storage: server-side disk (audio) + SQLite (metadata)
 *
 * Failures are swallowed — corpus collection must never disrupt the user flow.
 *
 * The user can opt out by setting localStorage['resonance_corpus_optout'] = '1'
 * (managed in Settings page). When opted out, this hook becomes a no-op.
 */

const CORPUS_API = `${import.meta.env.VITE_WORKER_API_URL || ''}/api/corpus`;
export const CORPUS_OPTOUT_KEY = 'resonance_corpus_optout';

export function isCorpusOptedOut(): boolean {
  try {
    return localStorage.getItem(CORPUS_OPTOUT_KEY) === '1';
  } catch {
    return false;
  }
}

export function useCorpusCollection() {
  const collect = useCallback(async (audioBlob: Blob, transcript: string, durationSec: number) => {
    if (isCorpusOptedOut()) {
      console.log('[Corpus] Skipped — user opted out');
      return;
    }
    try {
      const ts = Date.now();
      const ext = audioBlob.type.includes('webm')
        ? 'webm'
        : audioBlob.type.includes('mp3')
        ? 'mp3'
        : audioBlob.type.includes('wav')
        ? 'wav'
        : 'bin';
      const fileName = `web_${ts}.${ext}`;

      const form = new FormData();
      form.append('file', audioBlob, fileName);
      form.append('label', transcript);
      form.append('duration_ms', String(Math.round(durationSec * 1000)));
      form.append('source', 'web');
      form.append(
        'metadata',
        JSON.stringify({
          user_agent: navigator.userAgent,
          locale: navigator.language,
          collected_at: new Date().toISOString(),
          mime_type: audioBlob.type || 'audio/webm',
        }),
      );

      const res = await fetch(CORPUS_API, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        console.warn('[Corpus] Upload failed:', res.status, data);
        return;
      }

      console.log('[Corpus] Collected:', data.file_name, transcript.slice(0, 30));
    } catch (err) {
      console.warn('[Corpus] Collection error:', err);
    }
  }, []);

  return { collect };
}
