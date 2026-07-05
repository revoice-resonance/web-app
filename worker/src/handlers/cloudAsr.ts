/**
 * Cloud ASR proxy handler
 *
 * Proxies audio-to-text requests from the frontend to the upstream SSE ASR API.
 * Receives base64-encoded audio, forwards it to the streaming endpoint,
 * aggregates the SSE text stream, and returns the full transcript as JSON.
 *
 * Also includes a lightweight health check endpoint that verifies the
 * API key is configured (no outbound call to upstream).
 *
 * Exports:
 *   handleCloudASRRequest   — POST /api/asr/recognize
 *   handleCloudHealthRequest — GET /api/asr/health
 */

import { ServiceManager } from '../services/ServiceManager';
import { createCorsResponse, createErrorResponse, createSuccessResponse } from '../utils';
import type { Env } from '../types/env';

// ---------------------------------------------------------------------------
// Configurable constants
// ---------------------------------------------------------------------------

/** Format descriptor sent to upstream when the client-provided mimeType is
 *  missing or unrecognised.  Assumes Chrome MediaRecorder webm/opus default. */
const DEFAULT_AUDIO_FORMAT = {
  type: 'ogg',
  codec: 'opus',
  rate: 48000,
  bits: 16,
  channel: 1,
} as const;

// ---------------------------------------------------------------------------
// MIME type → upstream format block mapping
// ---------------------------------------------------------------------------

interface AudioFormatBlock {
  type: string;
  codec: string;
  rate: number;
  bits: number;
  channel: number;
}

/** Map known browser MediaRecorder mimeTypes to upstream format blocks.
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
// Request body types
// ---------------------------------------------------------------------------

interface CloudASRBody {
  audio: string;
  mimeType?: string;
  model?: string;
  language?: string;
  /**
   * Optional list of text phrases the user has trained.
   * Passed through to the upstream ASR API verbatim — the Worker does
   * zero processing on these values.
   *
   * If the upstream model does not support phrase hints, this field is
   * a silent no-op (upstream ignores unknown keys in the JSON body).
   */
  phrase_hints?: string[];
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * Cloud ASR proxy endpoint — POST /api/asr/recognize
 *
 * Receives a JSON body with base64-encoded audio, forwards it to the upstream
 * SSE ASR API, aggregates the transcript stream, and returns the result.
 */
export async function handleCloudASRRequest(
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
    console.log('[asr] API key missing → 503');
    return createCorsResponse(createErrorResponse('语音识别服务未配置'), 503);
  }

  // --- Parse body ---
  let body: CloudASRBody;
  try {
    body = (await request.json()) as CloudASRBody;
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

  // --- Build upstream request body ---
  const upstreamBody: Record<string, unknown> = {
    audio: {
      data: audio,
      input: {
        transcription: {
          model,
          language,
          enable_itn: true,
        },
        format: {
          type: format.type,
          codec: format.codec,
          rate: format.rate,
          bits: format.bits,
          channel: format.channel,
        },
      },
    },
  };

  // Pass phrase hints through to upstream if the client provided them.
  // The Worker does zero processing — upstream ignores the key if
  // unsupported by the chosen model.
  if (body.phrase_hints && body.phrase_hints.length > 0) {
    upstreamBody.phrase_hints = body.phrase_hints;
  }

  const startedAt = Date.now();
  console.log('[asr] request', {
    model,
    language,
    audioLength: audio.length,
    mimeType: body.mimeType || '(none)',
  });

  // --- Upstream fetch ---
  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/audio/asr`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(upstreamBody),
    });
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    console.log('[asr] network error', {
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: elapsed,
    });
    return createCorsResponse(createErrorResponse('语音识别服务暂时不可用'), 502);
  }

  const elapsedMs = Date.now() - startedAt;

  // --- Map upstream status ---
  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => '');

    // Mask upstream 401 as 503 (don't leak auth state to the client).
    const status = upstream.status === 401 ? 503 : upstream.status;
    const errorMessage = status === 503
      ? '语音识别服务未授权'
      : upstream.status === 429
        ? '请求频率受限，请稍后重试'
        : upstream.status >= 500
          ? '语音识别服务暂时不可用'
          : '请求参数错误';

    console.log('[asr] upstream error', {
      upstreamStatus: upstream.status,
      mappedStatus: status,
      elapsedMs,
      bodySnippet: errText.slice(0, 200),
    });

    return createCorsResponse(createErrorResponse(errorMessage), status);
  }

  // --- Parse batch response ---
  const resp = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
  const respData = resp.data as Record<string, unknown> | undefined;
  const transcript = (typeof respData?.text === 'string' ? respData.text : typeof resp.text === 'string' ? resp.text : '').trim();

  console.log('[asr] success', {
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
 * Cloud ASR health check — GET /api/asr/health
 *
 * Lightweight key-presence check only.  Does NOT send a probe request to
 * the upstream API — verifying the key is configured is sufficient for the
 * frontend health indicator.
 */
export function handleCloudHealthRequest(env: Env): Response {
  if (env.CLOUD_SPEECH_API_KEY) {
    return createCorsResponse(
      { ok: true },
      200,
    );
  }
  return createCorsResponse({ ok: false }, 503);
}
