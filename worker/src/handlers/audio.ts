import { ServiceManager } from '../services/ServiceManager';
import { createCorsResponse, createSuccessResponse, createErrorResponse, generateId } from '../utils';

/**
 * 处理音频上传请求（用于ASR/TTS）
 */
export async function handleAudioUploadRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method !== 'POST') {
    return createCorsResponse(createErrorResponse('Method not allowed'), 405);
  }

  try {
    const formData = await request.formData();
    const audioFileRaw = formData.get('file') as unknown;

    // 使用类型守卫
    if (!audioFileRaw || !(audioFileRaw instanceof File)) {
      return createCorsResponse(createErrorResponse('缺少音频文件或格式错误'));
    }

    const audioBuffer = await audioFileRaw.arrayBuffer();
    const storageManager = serviceManager.getStorageManager();

    // 生成唯一标识符
    const audioId = generateId('audio');
    const audioKey = `audio/${audioId}.wav`;

    // 保存音频到S3
    const result = await storageManager.saveAudio(audioKey, audioBuffer, {
      originalName: audioFileRaw.name,
      type: audioFileRaw.type,
      size: audioFileRaw.size,
      uploadedAt: new Date().toISOString(),
    });

    await serviceManager.getLoggingService().info('Audio uploaded to S3', {
      audioKey: result.key,
      type: audioFileRaw.type,
      size: audioFileRaw.size,
    });

    return createCorsResponse(createSuccessResponse({
      audioKey: result.key,
      url: result.url,
      message: '音频上传成功'
    }));

  } catch (error) {
    await serviceManager.getLoggingService().error('Audio upload failed', {
      error: error instanceof Error ? error.message : String(error)
    });

    return createCorsResponse(createErrorResponse(
      error instanceof Error ? error.message : '音频上传失败'
    ));
  }
}