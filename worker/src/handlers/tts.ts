import { ServiceManager } from '../services/ServiceManager';
import { createCorsResponse, createSuccessResponse, createErrorResponse } from '../utils';
import { TTSJobSubmitRequest, TTSVoiceCloneRequest, TTSJobStatusRequest } from '../types/requests';

/**
 * 提交TTS合成任务
 */
export async function handleTTSJobSubmitRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method !== 'POST') {
    return createCorsResponse(createErrorResponse('Method not allowed'), 405);
  }

  try {
    const body = await request.json() as TTSJobSubmitRequest;
    const { text, voice, speed, pitch } = body;

    if (!text) {
      return createCorsResponse(createErrorResponse('缺少合成文本'));
    }

    const ttsService = serviceManager.getTTSService();
    const job = await ttsService.submitSynthesisJob({ text, voice, speed, pitch });

    await serviceManager.getLoggingService().info('TTS job submitted', {
      jobId: job.jobId,
      textLength: text.length,
      voice: voice || 'default',
    });

    return createCorsResponse(createSuccessResponse(job));

  } catch (error) {
    await serviceManager.getLoggingService().error('TTS job submission failed', {
      error: error instanceof Error ? error.message : String(error)
    });

    return createCorsResponse(createErrorResponse(
      error instanceof Error ? error.message : 'TTS任务提交失败'
    ));
  }
}

/**
 * 提交语音克隆任务
 */
export async function handleVoiceCloneJobSubmitRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method !== 'POST') {
    return createCorsResponse(createErrorResponse('Method not allowed'), 405);
  }

  try {
    const body = await request.json() as TTSVoiceCloneRequest;
    const { referenceAudioKey, text } = body;

    if (!referenceAudioKey || !text) {
      return createCorsResponse(createErrorResponse('缺少参考音频标识符或合成文本'));
    }

    const ttsService = serviceManager.getTTSService();
    const job = await ttsService.submitVoiceCloneJob(referenceAudioKey, text);

    await serviceManager.getLoggingService().info('Voice clone job submitted', {
      jobId: job.jobId,
      referenceAudioKey,
      textLength: text.length,
    });

    return createCorsResponse(createSuccessResponse(job));

  } catch (error) {
    await serviceManager.getLoggingService().error('Voice clone job submission failed', {
      error: error instanceof Error ? error.message : String(error)
    });

    return createCorsResponse(createErrorResponse(
      error instanceof Error ? error.message : '语音克隆任务提交失败'
    ));
  }
}

/**
 * 查询TTS任务状态
 */
export async function handleTTSJobStatusRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method !== 'GET') {
    return createCorsResponse(createErrorResponse('Method not allowed'), 405);
  }

  try {
    const url = new URL(request.url);
    const jobId = url.searchParams.get('jobId');

    if (!jobId) {
      return createCorsResponse(createErrorResponse('缺少任务ID'));
    }

    const ttsService = serviceManager.getTTSService();
    const job = await ttsService.getJobStatus(jobId);

    return createCorsResponse(createSuccessResponse(job));

  } catch (error) {
    return createCorsResponse(createErrorResponse(
      error instanceof Error ? error.message : 'TTS任务状态查询失败'
    ));
  }
}