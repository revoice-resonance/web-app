import { ServiceManager } from '../services/ServiceManager';
import { createCorsResponse, createErrorResponse } from '../utils';
import type { Env } from '../types/env';

interface CloudTTSBody {
  text: string;
  voice?: string;
  model?: string;
  response_format?: 'mp3' | 'wav' | 'flac' | 'opus' | 'pcm';
  speed?: number;
  volume?: number;
  sample_rate?: 8000 | 16000 | 22050 | 24000 | 48000;
  instruction?: string;
}

const DEFAULT_BASE = 'https://api.cloud-speech.com/v1';
const DEFAULT_MODEL = 'step-tts-mini';
const DEFAULT_VOICE = 'wenrounvsheng';
const MAX_INPUT_CHARS = 1000;

export async function handleCloudTTSRequest(
  request: Request,
  serviceManager: ServiceManager,
  env: Env,
): Promise<Response> {
  if (request.method !== 'POST') {
    return createCorsResponse(createErrorResponse('Method not allowed'), 405);
  }

  const apiKey = env.CLOUD_SPEECH_API_KEY;
  if (!apiKey) {
    await serviceManager.getLoggingService().error('TTS misconfigured: API key missing', {});
    return createCorsResponse(createErrorResponse('语音合成服务未配置'), 503);
  }

  let body: CloudTTSBody;
  try {
    body = await request.json() as CloudTTSBody;
  } catch {
    return createCorsResponse(createErrorResponse('请求体必须是 JSON'), 400);
  }

  const text = (body.text || '').trim();
  if (!text) {
    return createCorsResponse(createErrorResponse('缺少合成文本 text'), 400);
  }
  if (text.length > MAX_INPUT_CHARS) {
    return createCorsResponse(createErrorResponse(`合成文本过长（最多 ${MAX_INPUT_CHARS} 字符）`), 400);
  }

  const baseUrl = (env.CLOUD_SPEECH_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
  const model = body.model || env.CLOUD_SPEECH_DEFAULT_MODEL || DEFAULT_MODEL;
  const voice = body.voice || env.CLOUD_SPEECH_DEFAULT_VOICE || DEFAULT_VOICE;
  const responseFormat = body.response_format || 'mp3';

  const upstreamBody: Record<string, unknown> = {
    model,
    input: text,
    voice,
    response_format: responseFormat,
  };
  if (typeof body.speed === 'number') upstreamBody.speed = body.speed;
  if (typeof body.volume === 'number') upstreamBody.volume = body.volume;
  if (typeof body.sample_rate === 'number') upstreamBody.sample_rate = body.sample_rate;
  if (body.instruction && model === 'stepaudio-2.5-tts') {
    upstreamBody.instruction = body.instruction;
  }

  const startedAt = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(upstreamBody),
    });
  } catch (err) {
    await serviceManager.getLoggingService().error('TTS upstream fetch failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return createCorsResponse(createErrorResponse('语音合成服务暂时不可用'), 502);
  }

  const elapsed = Date.now() - startedAt;

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => '');
    await serviceManager.getLoggingService().error('TTS upstream error', {
      status: upstream.status,
      body: errText.slice(0, 500),
      model,
      voice,
      textLength: text.length,
      elapsedMs: elapsed,
    });
    const safeMessage = upstream.status === 401
      ? '语音合成服务未授权'
      : upstream.status === 429
        ? '请求频率受限，请稍后重试'
        : `语音合成服务返回 ${upstream.status}`;
    return createCorsResponse(createErrorResponse(safeMessage), upstream.status >= 500 ? 502 : upstream.status);
  }

  const audioBuffer = await upstream.arrayBuffer();

  await serviceManager.getLoggingService().info('TTS synthesized', {
    model,
    voice,
    textLength: text.length,
    audioBytes: audioBuffer.byteLength,
    elapsedMs: elapsed,
    format: responseFormat,
  });

  const contentTypeMap: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    flac: 'audio/flac',
    opus: 'audio/ogg',
    pcm: 'audio/L16',
  };

  return new Response(audioBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentTypeMap[responseFormat] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
