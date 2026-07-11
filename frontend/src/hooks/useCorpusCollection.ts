import { useCallback } from 'react';
import { api } from '@/lib/api';

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

      const data = await api.corpus.collect(form);

      if (!data?.ok) {
        console.warn('[Corpus] Upload failed:', data);
        return;
      }

      console.log('[Corpus] Collected:', data.file_name, transcript.slice(0, 30));
    } catch (err) {
      console.warn('[Corpus] Collection error:', err);
    }
  }, []);

  return { collect };
}
