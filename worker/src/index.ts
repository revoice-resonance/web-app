/**
 * Project Resonance Worker - 重构版本
 * 采用存储层 + 业务层的分层架构
 */

import { ServiceManager } from './services/ServiceManager';
import { createCorsResponse, createSuccessResponse, createErrorResponse, generateId } from './utils';

export interface Env {
  // VPC 绑定
  WHISPER_VPC?: Fetcher;
  COSYVOICE_VPC?: Fetcher;
  
  // Gemini ASR 配置
  GEMINI_ASR_URL?: string;
  GEMINI_ASR_KEY?: string;
  
  // 存储配置
  RESONANCE_KV?: KVNamespace;
  
  // Minio 对象存储配置（用于语料收集）
  MINIO_ENDPOINT?: string;
  MINIO_PORT?: string;
  MINIO_USE_SSL?: string;
  MINIO_ACCESS_KEY: string;
  MINIO_SECRET_KEY: string;
  MINIO_BUCKET_NAME: string;
  MINIO_REGION?: string;
  
  // 静态资源
  ASSETS: Fetcher;
}

/**
 * 处理音频上传请求（用于ASR/TTS）
 */
async function handleAudioUploadRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
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

/**
 * 提交ASR识别任务
 */
async function handleASRJobSubmitRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method !== 'POST') {
    return createCorsResponse(createErrorResponse('Method not allowed'), 405);
  }

  try {
    const body = await request.json();
    const { audioKey, language, prefer } = body as { audioKey: string; language?: string; prefer?: string };
    
    if (!audioKey) {
      return createCorsResponse(createErrorResponse('缺少音频文件标识符'));
    }

    const asrService = serviceManager.getASRService();
    const job = await asrService.submitTranscriptionJob(audioKey, { language, prefer: prefer as any });
    
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
async function handleASRJobStatusRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method === 'GET') {
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
  
  return createCorsResponse(createErrorResponse('Method not allowed'), 405);
}

/**
 * 提交TTS合成任务
 */
async function handleTTSJobSubmitRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method !== 'POST') {
    return createCorsResponse(createErrorResponse('Method not allowed'), 405);
  }

  try {
    const body = await request.json();
    const { text, voice, speed, pitch } = body as { text: string; voice?: string; speed?: number; pitch?: number };
    
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
async function handleVoiceCloneJobSubmitRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method !== 'POST') {
    return createCorsResponse(createErrorResponse('Method not allowed'), 405);
  }

  try {
    const body = await request.json();
    const { referenceAudioKey, text } = body as { referenceAudioKey: string; text: string };
    
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
async function handleTTSJobStatusRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method === 'GET') {
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
  
  return createCorsResponse(createErrorResponse('Method not allowed'), 405);
}

/**
 * 处理日志查询请求
 */
async function handleLogsRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const limit = parseInt(url.searchParams.get('limit') || '100');
      
      const logs = await serviceManager.getLoggingService().getRecentLogs(limit);
      return createCorsResponse(createSuccessResponse({ logs }));
      
    } catch (error) {
      return createCorsResponse(createErrorResponse('日志查询失败'));
    }
  }
  
  return createCorsResponse(createErrorResponse('Method not allowed'), 405);
}

/**
 * 处理健康检查请求
 */
async function handleHealthCheck(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method === 'GET') {
    try {
      const health = await serviceManager.healthCheck();
      return createCorsResponse(createSuccessResponse(health));
    } catch (error) {
      return createCorsResponse(createErrorResponse('健康检查失败'));
    }
  }
  
  return createCorsResponse(createErrorResponse('Method not allowed'), 405);
}

/**
 * 处理语料上传请求
 */
async function handleCorpusUploadRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method !== 'POST') {
    return createCorsResponse(createErrorResponse('Method not allowed'), 405);
  }

  try {
    const formData = await request.formData();
    
    // 获取音频文件
    const audioFileRaw = formData.get('audio') as unknown;
    // 使用类型守卫
    if (!audioFileRaw || !(audioFileRaw instanceof File)) {
      return createCorsResponse(createErrorResponse('缺少音频文件或格式错误'));
    }
    const audioFile = audioFileRaw;

    // 获取转录文本
    const transcript = formData.get('transcript') as string;
    if (!transcript) {
      return createCorsResponse(createErrorResponse('缺少转录文本'));
    }

    // 获取可选参数
    const speakerId = formData.get('speakerId') as string;
    const metadataStr = formData.get('metadata') as string;
    
    const metadata = metadataStr ? JSON.parse(metadataStr) : undefined;
    
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
async function handleCorpusBatchUploadRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
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
async function handleCorpusQueryRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
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
 * 处理客户端日志上传请求
 */
async function handleClientLogsUploadRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method !== 'POST') {
    return createCorsResponse(createErrorResponse('Method not allowed'), 405);
  }

  try {
    const body = await request.json();
    
    const logs = (body as any).logs as any[];
    if (!Array.isArray(logs)) {
      return createCorsResponse(createErrorResponse('请求格式错误，需要 logs 数组'));
    }

    const loggingService = serviceManager.getLoggingService();
    await loggingService.saveClientLogs(logs);
    
    return createCorsResponse(createSuccessResponse({
      message: '客户端日志上传成功',
      count: logs.length,
    }));
    
  } catch (error) {
    return createCorsResponse(createErrorResponse(
      error instanceof Error ? error.message : '客户端日志上传失败'
    ));
  }
}

/**
 * 处理日志查询请求
 */
async function handleLogsQueryRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const startTime = url.searchParams.get('startTime') || undefined;
      const endTime = url.searchParams.get('endTime') || undefined;
      const level = url.searchParams.get('level') || undefined;
      const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : 100;

      const loggingService = serviceManager.getLoggingService();
      
      // 查询日志
      const logs = await loggingService.queryLogs(startTime, endTime, level);
      
      // 应用分页
      const paginatedLogs = logs.slice(0, limit);
      
      return createCorsResponse(createSuccessResponse({
        logs: paginatedLogs,
        total: logs.length,
        returned: paginatedLogs.length,
        query: { startTime, endTime, level, limit }
      }));
      
    } catch (error) {
      return createCorsResponse(createErrorResponse(
        error instanceof Error ? error.message : '日志查询失败'
      ));
    }
  }
  
  return createCorsResponse(createErrorResponse('Method not allowed'), 405);
}

/**
 * 处理日志统计请求
 */
async function handleLogsStatsRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method === 'GET') {
    try {
      const loggingService = serviceManager.getLoggingService();
      const stats = { total: 0, byLevel: { info: 0, warn: 0, error: 0 }, recentErrors: 0 };
      
      return createCorsResponse(createSuccessResponse(stats));
    } catch (error) {
      return createCorsResponse(createErrorResponse('日志统计获取失败'));
    }
  }
  
  return createCorsResponse(createErrorResponse('Method not allowed'), 405);
}

/**
 * 处理语料统计请求
 */
async function handleCorpusStatsRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
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

/**
 * 处理服务统计请求
 */
async function handleStatsRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method === 'GET') {
    try {
      const stats = await serviceManager.getServiceStats();
      return createCorsResponse(createSuccessResponse(stats));
    } catch (error) {
      return createCorsResponse(createErrorResponse('统计信息获取失败'));
    }
  }
  
  return createCorsResponse(createErrorResponse('Method not allowed'), 405);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 处理预检请求
    if (request.method === 'OPTIONS') {
      return createCorsResponse();
    }

    // 初始化服务管理器
    const serviceManager = new ServiceManager(env);
    
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // API 路由分发
      if (path === '/api/audio/upload') {
        return await handleAudioUploadRequest(request, serviceManager);
      }
      
      if (path === '/api/asr/jobs') {
        return await handleASRJobSubmitRequest(request, serviceManager);
      }
      
      if (path === '/api/asr/jobs/status') {
        return await handleASRJobStatusRequest(request, serviceManager);
      }
      
      if (path === '/api/tts/jobs') {
        return await handleTTSJobSubmitRequest(request, serviceManager);
      }
      
      if (path === '/api/tts/voice-clone') {
        return await handleVoiceCloneJobSubmitRequest(request, serviceManager);
      }
      
      if (path === '/api/tts/jobs/status') {
        return await handleTTSJobStatusRequest(request, serviceManager);
      }
      
      if (path === '/api/client-logs') {
        return await handleLogsRequest(request, serviceManager);
      }
      
      if (path === '/api/health') {
        return await handleHealthCheck(request, serviceManager);
      }
      
      if (path === '/api/corpus/upload') {
        return await handleCorpusUploadRequest(request, serviceManager);
      }
      
      if (path === '/api/corpus/batch-upload') {
        return await handleCorpusBatchUploadRequest(request, serviceManager);
      }
      
      if (path === '/api/corpus/query') {
        return await handleCorpusQueryRequest(request, serviceManager);
      }
      
      if (path === '/api/corpus/stats') {
        return await handleCorpusStatsRequest(request, serviceManager);
      }
      
      if (path === '/api/logs/client-upload') {
        return await handleClientLogsUploadRequest(request, serviceManager);
      }
      
      if (path === '/api/logs/query') {
        return await handleLogsQueryRequest(request, serviceManager);
      }
      
      if (path === '/api/logs/stats') {
        return await handleLogsStatsRequest(request, serviceManager);
      }
      
      if (path === '/api/stats') {
        return await handleStatsRequest(request, serviceManager);
      }
      
      // 其他路由：服务静态资源
      return env.ASSETS.fetch(request);
      
    } catch (error) {
      // 全局错误处理
      await serviceManager.getLoggingService().error('Unhandled error in worker', {
        path,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return createCorsResponse(createErrorResponse('Internal server error'), 500);
    }
  },
};