import { ServiceManager } from '../services/ServiceManager';
import { createCorsResponse, createSuccessResponse, createErrorResponse } from '../utils';
import { ASRJobSubmitRequest, ASRJobStatusRequest } from '../types/requests';

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