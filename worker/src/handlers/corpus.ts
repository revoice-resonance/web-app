import { ServiceManager } from '../services/ServiceManager';
import { createCorsResponse, createSuccessResponse, createErrorResponse } from '../utils';

/**
 * 处理语料上传请求
 */
export async function handleCorpusUploadRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method !== 'POST') {
    return createCorsResponse(createErrorResponse('Method not allowed'), 405);
  }

  try {
    const formData = await request.formData();

    // 获取音频文件：前端用 'file'，旧调用方用 'audio'，二者兼容
    const audioFileRaw = (formData.get('file') ?? formData.get('audio')) as unknown;
    if (!audioFileRaw || !(audioFileRaw instanceof File)) {
      return createCorsResponse(createErrorResponse('缺少音频文件或格式错误'), 400);
    }
    const audioFile = audioFileRaw;

    // 获取转录文本：前端用 'label'，旧调用方用 'transcript'
    const transcript = (formData.get('label') as string) ?? (formData.get('transcript') as string);
    if (!transcript) {
      return createCorsResponse(createErrorResponse('缺少转录文本'), 400);
    }

    // 获取可选参数
    const speakerId = formData.get('speakerId') as string;
    const durationMsStr = formData.get('duration_ms') as string;
    const source = formData.get('source') as string;
    const metadataStr = formData.get('metadata') as string;

    const parsedMetadata = metadataStr ? JSON.parse(metadataStr) : {};
    // duration_ms / source 不在 CorpusData 字段内，并入 metadata 一并保留
    const metadata: Record<string, any> = {
      ...parsedMetadata,
      ...(durationMsStr ? { duration_ms: Number(durationMsStr) } : {}),
      ...(source ? { source } : {}),
    };

    const audioBuffer = await audioFile.arrayBuffer();

    const corpusData = {
      audio: audioBuffer,
      transcript,
      speakerId: speakerId || undefined,
      metadata,
    };

    const corpusService = serviceManager.getCorpusService();
    const result = await corpusService.upload(corpusData);

    return createCorsResponse(createSuccessResponse({
      message: '语料上传成功',
      corpusId: result.corpusId,
      file_name: `corpus_${result.corpusId}`,
      audioSize: audioBuffer.byteLength,
      transcriptLength: transcript.length,
    }));

  } catch (error) {
    return createCorsResponse(createErrorResponse(
      error instanceof Error ? error.message : '语料上传失败'
    ));
  }
}

/**
 * 处理语料批量上传请求
 */
export async function handleCorpusBatchUploadRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method !== 'POST') {
    return createCorsResponse(createErrorResponse('Method not allowed'), 405);
  }

  try {
    const body = await request.json();

    const corpusData = (body as any).corpusData as any[];
    if (!Array.isArray(corpusData)) {
      return createCorsResponse(createErrorResponse('corpusData 必须是数组'));
    }

    const corpusService = serviceManager.getCorpusService();

    // 由于uploadBatch方法可能不存在，我们使用循环上传
    const results = [];
    for (const item of corpusData) {
      try {
        const result = await corpusService.upload(item);
        results.push(result);
      } catch (error) {
        results.push({ success: false, error: (error as Error).message });
      }
    }

    return createCorsResponse(createSuccessResponse({
      message: '批量语料上传完成',
      results,
    }));

  } catch (error) {
    return createCorsResponse(createErrorResponse(
      error instanceof Error ? error.message : '批量语料上传失败'
    ));
  }
}

/**
 * 处理语料查询请求
 */
export async function handleCorpusQueryRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const query: any = {
      corpusId: url.searchParams.get('corpusId') || undefined,
      speakerId: url.searchParams.get('speakerId') || undefined,
      startTime: url.searchParams.get('startTime') || undefined,
      endTime: url.searchParams.get('endTime') || undefined,
      limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : undefined,
      offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!) : undefined,
    };

      const corpusService = serviceManager.getCorpusService();
      const results = await corpusService.query(query);

      return createCorsResponse(createSuccessResponse({
        query,
        results,
        count: results.length,
      }));
    } catch (error) {
      return createCorsResponse(createErrorResponse(
        error instanceof Error ? error.message : '语料查询失败'
      ));
    }
  }

  return createCorsResponse(createErrorResponse('Method not allowed'), 405);
}

/**
 * 处理语料统计请求
 */
export async function handleCorpusStatsRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method === 'GET') {
    try {
      const corpusService = serviceManager.getCorpusService();
      const stats = await corpusService.getStats();

      return createCorsResponse(createSuccessResponse(stats));
    } catch (error) {
      return createCorsResponse(createErrorResponse('语料统计获取失败'));
    }
  }

  return createCorsResponse(createErrorResponse('Method not allowed'), 405);
}