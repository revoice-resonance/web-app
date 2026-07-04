import { ServiceManager } from '../services/ServiceManager';
import { createCorsResponse, createErrorResponse, createSuccessResponse } from '../utils';
import type { Env } from '../types/env';

const DEFAULT_BASE = 'https://api.cloud-speech.com/v1';
const DEFAULT_MODEL = 'step-tts-mini';

/**
 * Voice cloning endpoint — POST /api/tts/voices/clone
 *
 * Receives a reference audio blob (5-10s WAV/MP3) plus optional reference text,
 * uploads the file to the upstream file service, then calls the voice creation
 * API to clone the voice. Returns the new voice ID that can be used in TTS
 * requests.
 *
 * Two-step workflow:
 *   1. POST /v1/files (multipart, purpose=storage) → file_id
 *   2. POST /v1/audio/voices { file_id, model, text } → voice id
 */
export async function handleVoiceCloneRequest(
  request: Request,
  serviceManager: ServiceManager,
  env: Env,
): Promise<Response> {
  if (request.method !== 'POST') {
    return createCorsResponse(createErrorResponse('Method not allowed'), 405);
  }

  const apiKey = env.CLOUD_SPEECH_API_KEY;
  if (!apiKey) {
    await serviceManager.getLoggingService().error('Voice clone misconfigured: API key missing', {});
    return createCorsResponse(createErrorResponse('语音合成服务未配置'), 503);
  }

  const baseUrl = (env.CLOUD_SPEECH_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');

  // Parse multipart body
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return createCorsResponse(createErrorResponse('请求体必须是 multipart/form-data'), 400);
  }

  const audioFile = formData.get('audio') as File | null;
  const referenceText = (formData.get('text') as string | null)?.trim() || '';
  const model = (formData.get('model') as string | null) || env.CLOUD_SPEECH_DEFAULT_MODEL || DEFAULT_MODEL;

  if (!audioFile || audioFile.size === 0) {
    return createCorsResponse(createErrorResponse('缺少参考音频文件'), 400);
  }

  // Validate audio duration (crude size check: assume ~16KB/s for compressed audio)
  if (audioFile.size > 2 * 1024 * 1024) {
    return createCorsResponse(createErrorResponse('参考音频文件过大（最大 2MB）'), 400);
  }

  try {
    // ----- Step 1: Upload audio file -----
    const uploadForm = new FormData();
    uploadForm.append('purpose', 'storage');
    uploadForm.append('file', audioFile, audioFile.name || 'reference.wav');

    const uploadStarted = Date.now();
    let uploadResponse: Response;
    try {
      uploadResponse = await fetch(`${baseUrl}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: uploadForm,
      });
    } catch (err) {
      await serviceManager.getLoggingService().error('Voice clone file upload failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return createCorsResponse(createErrorResponse('音频上传失败'), 502);
    }

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text().catch(() => '');
      await serviceManager.getLoggingService().error('Voice clone file upload upstream error', {
        status: uploadResponse.status,
        body: errText.slice(0, 500),
      });
      const msg = uploadResponse.status === 401 ? '语音合成服务未授权'
        : uploadResponse.status >= 500 ? '音频上传服务暂时不可用'
        : '音频文件格式不支持';
      return createCorsResponse(createErrorResponse(msg), uploadResponse.status >= 500 ? 502 : uploadResponse.status);
    }

    const uploadResult = await uploadResponse.json() as { id?: string };
    const fileId = uploadResult.id;
    if (!fileId) {
      return createCorsResponse(createErrorResponse('音频上传成功但未获得文件 ID'), 502);
    }

    await serviceManager.getLoggingService().info('Voice clone file uploaded', {
      fileId,
      fileSize: audioFile.size,
      fileName: audioFile.name,
      elapsedMs: Date.now() - uploadStarted,
    });

    // ----- Step 2: Create voice -----
    const voiceBody: Record<string, unknown> = {
      file_id: fileId,
      model,
    };
    if (referenceText) {
      voiceBody.text = referenceText;
    }

    const cloneStarted = Date.now();
    let cloneResponse: Response;
    try {
      cloneResponse = await fetch(`${baseUrl}/audio/voices`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(voiceBody),
      });
    } catch (err) {
      await serviceManager.getLoggingService().error('Voice clone creation failed', {
        fileId,
        error: err instanceof Error ? err.message : String(err),
      });
      return createCorsResponse(createErrorResponse('音色复刻请求失败'), 502);
    }

    const cloneElapsed = Date.now() - cloneStarted;

    if (!cloneResponse.ok) {
      const errText = await cloneResponse.text().catch(() => '');
      await serviceManager.getLoggingService().error('Voice clone creation upstream error', {
        fileId,
        status: cloneResponse.status,
        body: errText.slice(0, 500),
        elapsedMs: cloneElapsed,
      });

      if (cloneResponse.status === 401) {
        return createCorsResponse(createErrorResponse('语音合成服务未授权'), 503);
      }
      if (cloneResponse.status === 429) {
        return createCorsResponse(createErrorResponse('请求频率受限，请稍后重试'), 429);
      }

      // Try to extract upstream error detail
      let detail = '音色复刻失败';
      try {
        const errJson = JSON.parse(errText);
        if (errJson.error?.message) detail = errJson.error.message;
      } catch { /* not JSON */ }
      return createCorsResponse(createErrorResponse(detail), cloneResponse.status >= 500 ? 502 : cloneResponse.status);
    }

    const cloneResult = await cloneResponse.json() as { id?: string; duplicated?: boolean };
    const voiceId = cloneResult.id;
    if (!voiceId) {
      return createCorsResponse(createErrorResponse('音色复刻成功但未获得音色 ID'), 502);
    }

    await serviceManager.getLoggingService().info('Voice clone created', {
      fileId,
      voiceId,
      model,
      duplicated: cloneResult.duplicated ?? false,
      elapsedMs: Date.now() - uploadStarted,
    });

    return createCorsResponse(
      createSuccessResponse({
        voice_id: voiceId,
        duplicated: cloneResult.duplicated ?? false,
      }),
      201,
    );
  } catch (err) {
    await serviceManager.getLoggingService().error('Voice clone unexpected error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return createCorsResponse(createErrorResponse('音色复刻处理异常'), 500);
  }
}
