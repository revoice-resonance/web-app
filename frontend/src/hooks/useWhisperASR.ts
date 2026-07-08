/**
 * Whisper ASR hook — thin re-export of useCloudASR.
 *
 * The Worker endpoint has migrated from the legacy FormData-based
 * `/api/whisper-asr` to the JSON-based `/api/asr/recognize`. The
 * `useCloudASR` hook implements the new protocol and its interface
 * is a superset of the old `useWhisperASR` interface, so this file
 * is now a simple re-export for backward compatibility.
 *
 * Consumers should migrate to importing `useCloudASR` directly.
 */

export { useCloudASR as useWhisperASR } from './useCloudASR';
export type { UseCloudASRReturn as UseWhisperASRReturn } from './useCloudASR';
