/**
 * CloudSpeech ASR proxy handler
 *
 * Proxies audio-to-text requests from the frontend to the CloudSpeech SSE ASR API.
 * Receives base64-encoded audio, forwards it to CloudSpeech's streaming endpoint,
 * aggregates the SSE text stream, and returns the full transcript as JSON.
 *
 * Also includes a lightweight health check endpoint that verifies the
 * CLOUD_SPEECH_API_KEY is configured (no outbound call to CloudSpeech).
 *
 * Exports:
 *   handleCloudSpeechASRRequest   — POST /api/asr/cloud-speech
 *   handleCloudSpeechHealthRequest — GET /api/cloud-speech/health
 */

import { ServiceManager } from '../services/ServiceManager';
import { createCorsResponse, createErrorResponse, createSuccessResponse } from '../utils';
import type { Env } from '../types/env';

// ---------------------------------------------------------------------------
// Configurable SSE parser constants
// Tuned against the CloudSpeech SSE ASR protocol; change these when the
// upstream event names or JSON payload structure change — no logic rewrite.
// ---------------------------------------------------------------------------

/** SSE event name that carries a transcript fragment. */
const SSE_EVENT_RESULT = 'result';

/** Dot-delimited path into the parsed JSON payload to extract transcript text.
 *  "data.data" means parsed.data.data  */
const SSE_DATA_PATH = 'data.data';

// ---------------------------------------------------------------------------
// Audio format defaults
// ---------------------------------------------------------------------------

/** Format descriptor sent to CloudSpeech when the client-provided mimeType is
 *  missing or unrecognised.  Assumes Chrome MediaRecorder webm/opus default. */
const DEFAULT_AUDIO_FORMAT = {
  type: 'ogg',
  codec: 'opus',
  rate: 48000,
  bits: 16,
  channel: 1,
} as const;

// ---------------------------------------------------------------------------
// MIME type → CloudSpeech format block mapping
// ---------------------------------------------------------------------------

interface AudioFormatBlock {
  type: string;
  codec: string;
  rate: number;
  bits: number;
  channel: number;
}

/** Map known browser MediaRecorder mimeTypes to CloudSpeech format blocks.
 *  Everything not listed falls back to DEFAULT_AUDIO_FORMAT. */
function mimeTypeToFormat(mimeType: string | undefined): AudioFormatBlock {
  if (!mimeType) return { ...DEFAULT_AUDIO_FORMAT };

  const m = mimeType.toLowerCase();

  if (m.startsWith('audio/webm') || m.startsWith('video/webm')) {
    return { type: 'ogg', codec: 'opus', rate: 48000, bits: 16, channel: 1 };
  }
  if (m.startsWith('audio/mp4') || m.startsWith('audio/aac')) {
    return { type: 'aac', codec: 'aac', rate: 48000, bits: 16, channel: 1 };
  }
  if (m.startsWith('audio/mpeg') || m.includes('mp3')) {
    return { type: 'mp3', codec: 'mp3', rate: 48000, bits: 16, channel: 1 };
  }
  if (m.startsWith('audio/wav') || m.includes('wav')) {
    return { type: 'wav', codec: 'pcm_s16le', rate: 48000, bits: 16, channel: 1 };
  }
  if (m.startsWith('audio/flac')) {
    return { type: 'flac', codec: 'flac', rate: 48000, bits: 16, channel: 1 };
  }
  if (m.startsWith('audio/ogg') || m.includes('opus')) {
    return { type: 'ogg', codec: 'opus', rate: 48000, bits: 16, channel: 1 };
  }

  return { ...DEFAULT_AUDIO_FORMAT };
}

// ---------------------------------------------------------------------------
// Model default
// ---------------------------------------------------------------------------

const ASR_DEFAULT_MODEL = 'stepaudio-2.5-asr';

// ---------------------------------------------------------------------------
// SSE stream parsing
// ---------------------------------------------------------------------------

/**
 * Parse a raw SSE text body and extract the aggregated transcript.
 *
 * SSE format assumption (configurable via constants above):
 *   data: {"event":"result","data":"你好"}\n\n
 *
 * Only events whose `event` field equals SSE_EVENT_RESULT contribute to the
 * final text.  The transcript fragment is read from the JSON path defined by
 * SSE_DATA_PATH.
 */
function parseSSETranscript(body: string): string {
  const parts: string[] = [];

  // Split on double-newline — the SSE event boundary.
  const chunks = body.split('\n\n');

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    // Collect all data: lines within this event block.
    const dataLines: string[] = [];
    for (const line of trimmed.split('\n')) {
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }
    if (dataLines.length === 0) continue;

    const joined = dataLines.join('\n');

    try {
      const parsed = JSON.parse(joined);

      // Check if this event is the "result" type we care about.
      const eventName: string | undefined = parsed.event;
      if (eventName !== SSE_EVENT_RESULT) continue;

      // Walk the configured data path to reach the transcript text.
      const text = getNestedValue(parsed, SSE_DATA_PATH);
      if (typeof text === 'string' && text.length > 0) {
        parts.push(text);
      }
    } catch {
      // Malformed SSE data line — skip and continue to next event.
    }
  }

  return parts.join('');
}

/** Walk a dot-delimited path (e.g. "data.data") into a nested object.
 *  Returns undefined for any non-existent intermediate key. */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

// ---------------------------------------------------------------------------
// Request body types
// ---------------------------------------------------------------------------

interface CloudSpeechASRBody {
  audio: string;
  mimeType?: string;
  model?: string;
  language?: string;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * CloudSpeech ASR proxy endpoint — POST /api/asr/cloud-speech
 *
 * Receives a JSON body with base64-encoded audio, forwards it to the CloudSpeech
 * SSE ASR API, aggregates the transcript stream, and returns the result.
 */
export async function handleCloudSpeechASRRequest(
  request: Request,
  serviceManager: ServiceManager,
  env: Env,
): Promise<Response> {
  if (request.method !== 'POST') {
    return createCorsResponse(createErrorResponse('Method not allowed'), 405);
  }

  // --- API key guard ---
  const apiKey = env.CLOUD_SPEECH_API_KEY;
  if (!apiKey) {
    console.log('[cloud-speech-asr] CLOUD_SPEECH_API_KEY missing → 503');
    return createCorsResponse(createErrorResponse('CloudSpeech API Key 未配置'), 503);
  }

  // --- Parse body ---
  let body: CloudSpeechASRBody;
  try {
    body = (await request.json()) as CloudSpeechASRBody;
  } catch {
    return createCorsResponse(createErrorResponse('请求体必须是 JSON'), 400);
  }

  // --- Validate audio ---
  const audio = (body.audio || '').trim();
  if (!audio) {
    return createCorsResponse(createErrorResponse('音频数据为空'), 400);
  }

  // --- Config ---
  const baseUrl = (env.CLOUD_SPEECH_BASE_URL || 'https://api.cloud-speech.com/v1').replace(/\/+$/, '');
  const model = body.model || env.CLOUD_SPEECH_ASR_DEFAULT_MODEL || ASR_DEFAULT_MODEL;
  const language = body.language || 'zh';
  const format = mimeTypeToFormat(body.mimeType);

  // --- Build CloudSpeech request body ---
  const cloud-speechBody = {
    audio: {
      data: audio,
      input: {
        transcription: {
          model,
          language,
          enable_itn: true,
        },
      },
      format: {
        type: format.type,
        codec: format.codec,
        rate: format.rate,
        bits: format.bits,
        channel: format.channel,
      },
    },
  };

  const startedAt = Date.now();
  console.log('[cloud-speech-asr] request', {
    model,
    language,
    audioLength: audio.length,
    mimeType: body.mimeType || '(none)',
  });

  // --- Upstream fetch ---
  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/audio/asr/sse`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(cloud-speechBody),
    });
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    console.log('[cloud-speech-asr] network error', {
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: elapsed,
    });
    return createCorsResponse(createErrorResponse('CloudSpeech 上游请求失败'), 502);
  }

  const elapsedMs = Date.now() - startedAt;

  // --- Map upstream status ---
  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => '');

    // Mask upstream 401 as 503 (don't leak auth state to the client).
    const status = upstream.status === 401 ? 503 : upstream.status;
    const errorMessage = status === 503
      ? 'CloudSpeech API Key 无效或已吊销'
      : upstream.status === 429
        ? 'CloudSpeech 请求频率受限，请稍后重试'
        : upstream.status >= 500
          ? 'CloudSpeech 服务暂时不可用'
          : '请求参数错误';

    console.log('[cloud-speech-asr] upstream error', {
      upstreamStatus: upstream.status,
      mappedStatus: status,
      elapsedMs,
      bodySnippet: errText.slice(0, 200),
    });

    return createCorsResponse(createErrorResponse(errorMessage), status);
  }

  // --- Parse SSE stream ---
  const sseText = await upstream.text();
  const transcript = parseSSETranscript(sseText);

  console.log('[cloud-speech-asr] success', {
    model,
    audioBytes: audio.length,
    transcriptLength: transcript.length,
    elapsedMs,
  });

  return createCorsResponse(
    createSuccessResponse({
      text: transcript,
      model,
      elapsed_ms: elapsedMs,
    }),
    200,
  );
}

/**
 * CloudSpeech health check — GET /api/cloud-speech/health
 *
 * Lightweight key-presence check only.  Does NOT send a probe request to
 * CloudSpeech's API — verifying the key is configured is sufficient for the
 * frontend health indicator.
 */
export function handleCloudSpeechHealthRequest(env: Env): Response {
  if (env.CLOUD_SPEECH_API_KEY) {
    return createCorsResponse(
      { ok: true, provider: 'cloud-speech' },
      200,
    );
  }
  return createCorsResponse({ ok: false }, 503);
}
