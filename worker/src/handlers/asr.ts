import { ServiceManager } from '../services/ServiceManager';
import { createCorsResponse, createSuccessResponse, createErrorResponse, generateId } from '../utils';
import { ASRJobSubmitRequest, ASRJobStatusRequest } from '../types/requests';

/**
 * 同步 ASR 识别（旧路径 /api/whisper-asr）
 *
 * 前端以 multipart/form-data 上传音频（字段 'file'），期望同步返回 { ok, data: { text, ... } }。
 * 当前本地 ASR 引擎为 mock（performTranscription 返回硬编码文本），故显式返回 501
 * NOT_IMPLEMENTED，让前端走浏览器 Web Speech 降级，而不是静默返回假文本。
 */
export async function handleWhisperASRRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method !== 'POST') {
    return createCorsResponse(createErrorResponse('Method not allowed'), 405);
  }

  try {
    const formData = await request.formData();
    const audioFileRaw = formData.get('file') as unknown;
    if (!audioFileRaw || !(audioFileRaw instanceof File)) {
      return createCorsResponse(createErrorResponse('缺少音频文件或格式错误'), 400);
    }

    const audioBuffer = await audioFileRaw.arrayBuffer();
    const storageManager = serviceManager.getStorageManager();
    const audioId = generateId('audio');
    const audioKey = `audio/${audioId}.webm`;
    await storageManager.saveAudio(audioKey, audioBuffer, {
      originalName: audioFileRaw.name,
      type: audioFileRaw.type,
      size: audioFileRaw.size,
      uploadedAt: new Date().toISOString(),
    });

    await serviceManager.getLoggingService().info('Sync ASR requested (engine not implemented)', {
      audioKey,
      size: audioFileRaw.size,
    });

    // 本地 ASR 引擎未实现 → 501，前端 isRetryable(501) 会降级到浏览器语音识别
    return createCorsResponse(
      createErrorResponse('ASR 转录引擎未实现（mock）：请配置 Whisper/Gemini ASR 后端，或使用浏览器降级'),
      501
    );
  } catch (error) {
    await serviceManager.getLoggingService().error('Sync ASR failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    return createCorsResponse(createErrorResponse(
      error instanceof Error ? error.message : 'ASR 识别失败'
    ), 500);
  }
}

/**
 * 提交ASR识别任务
 */
export async function handleASRJobSubmitRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method !== 'POST') {
    return createCorsResponse(createErrorResponse('Method not allowed'), 405);
  }

  try {
    const body = await request.json() as ASRJobSubmitRequest;
    const { audioKey, language, prefer } = body;

    if (!audioKey) {
      return createCorsResponse(createErrorResponse('缺少音频文件标识符'));
    }

    const asrService = serviceManager.getASRService();
    const job = await asrService.submitTranscriptionJob(audioKey, { language, prefer });

    await serviceManager.getLoggingService().info('ASR job submitted', {
      jobId: job.jobId,
      audioKey: job.audioKey,
      status: job.status,
    });

    return createCorsResponse(createSuccessResponse(job));

  } catch (error) {
    await serviceManager.getLoggingService().error('ASR job submission failed', {
      error: error instanceof Error ? error.message : String(error)
    });

    return createCorsResponse(createErrorResponse(
      error instanceof Error ? error.message : 'ASR任务提交失败'
    ));
  }
}

/**
 * 查询ASR任务状态
 */
export async function handleASRJobStatusRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method !== 'GET') {
    return createCorsResponse(createErrorResponse('Method not allowed'), 405);
  }

  try {
    const url = new URL(request.url);
    const jobId = url.searchParams.get('jobId');

    if (!jobId) {
      return createCorsResponse(createErrorResponse('缺少任务ID'));
    }

    const asrService = serviceManager.getASRService();
    const job = await asrService.getJobStatus(jobId);

    return createCorsResponse(createSuccessResponse(job));

  } catch (error) {
    return createCorsResponse(createErrorResponse(
      error instanceof Error ? error.message : 'ASR任务状态查询失败'
    ));
  }
}