import { ServiceManager } from '../services/ServiceManager';
import { createCorsResponse, createSuccessResponse, createErrorResponse } from '../utils';
import { TTSJobSubmitRequest, TTSJobStatusRequest } from '../types/requests';

/**
 * 提交TTS合成任务
 */
export async function handleTTSJobSubmitRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method !== 'POST') {
    return createCorsResponse(createErrorResponse('Method not allowed'), 405);
  }

  try {
    const body = await request.json() as TTSJobSubmitRequest;
    const { text } = body;

    if (!text) {
      return createCorsResponse(createErrorResponse('缺少合成文本'), 400);
    }

    // CosyVoice 本地通道为 mock（performSynthesis 返回硬编码字节）→ 显式 501。
    // 前端 useCosyVoiceTTS 会把任何 JSON/非音频响应当作错误抛出，501 与该行为一致。
    // 真实合成请使用云端通道 /api/tts/stepfun，或配置 COSYVOICE_VPC 后实现 performSynthesis。
    return createCorsResponse(
      createErrorResponse('TTS 合成暂未实现（CosyVoice 本地通道为 mock），请使用 /api/tts/stepfun 云端通道'),
      501
    );

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
    const formData = await request.formData();
    const promptWav = formData.get('prompt_wav') as unknown as File;
    const text = formData.get('tts_text') as string;

    if (!promptWav || !text) {
      return createCorsResponse(createErrorResponse('缺少参考音频文件或合成文本'), 400);
    }

    // 语音克隆本地通道为 mock（performVoiceCloning 返回硬编码字节）→ 显式 501。
    return createCorsResponse(
      createErrorResponse('语音克隆暂未实现（CosyVoice 本地通道为 mock）'),
      501
    );

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
