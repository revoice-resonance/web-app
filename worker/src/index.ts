/**
 * Project Resonance Worker - 重构版本
 * 采用存储层 + 业务层的分层架构
 */

import { ServiceManager } from './services/ServiceManager';
import { createCorsResponse, createSuccessResponse, createErrorResponse } from './utils';

export interface Env {
  // VPC 绑定
  WHISPER_VPC?: Fetcher;
  COSYVOICE_VPC?: Fetcher;
  
  // Gemini ASR 配置
  GEMINI_ASR_URL?: string;
  GEMINI_ASR_KEY?: string;
  
  // 存储配置
  RESONANCE_KV?: KVNamespace;
  
  // 静态资源
  ASSETS: Fetcher;
}

/**
 * 处理语音识别请求
 */
async function handleASRRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method !== 'POST') {
    return createCorsResponse(createErrorResponse('Method not allowed'), 405);
  }

  try {
    const formData = await request.formData();
    const audioFile = formData.get('file') as File;
    
    if (!audioFile) {
      return createCorsResponse(createErrorResponse('缺少音频文件'));
    }

    const audioBuffer = await audioFile.arrayBuffer();
    const asrService = serviceManager.getASRService();
    
    // 获取识别参数
    const language = formData.get('language') as string || 'zh-CN';
    const prefer = formData.get('prefer') as 'whisper' | 'gemini' | undefined;
    
    const result = await asrService.transcribe(audioBuffer, { language, prefer });
    
    // 记录成功日志
    await serviceManager.getLoggingService().info('ASR recognition completed', {
      duration: result.duration,
      confidence: result.confidence,
      source: result.source,
      language: result.language,
    });

    return createCorsResponse(createSuccessResponse(result));
    
  } catch (error) {
    await serviceManager.getLoggingService().error('ASR recognition failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    return createCorsResponse(createErrorResponse(
      error instanceof Error ? error.message : '语音识别失败'
    ));
  }
}

/**
 * 处理语音合成请求
 */
async function handleTTSRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method !== 'POST') {
    return createCorsResponse(createErrorResponse('Method not allowed'), 405);
  }

  try {
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      // 语音克隆请求
      const formData = await request.formData();
      const promptWav = formData.get('prompt_wav') as File;
      const ttsText = formData.get('tts_text') as string;
      
      if (!promptWav || !ttsText) {
        return createCorsResponse(createErrorResponse('缺少参考音频或合成文本'));
      }
      
      const audioBuffer = await promptWav.arrayBuffer();
      const ttsService = serviceManager.getTTSService();
      
      const result = await ttsService.cloneVoice(audioBuffer, ttsText);
      
      await serviceManager.getLoggingService().info('Voice cloning completed', {
        textLength: ttsText.length,
        duration: result.duration,
      });

      return createCorsResponse(createSuccessResponse(result));
      
    } else {
      // 标准语音合成请求
      const body = await request.json();
      const { text, voice, speed, pitch } = body;
      
      if (!text) {
        return createCorsResponse(createErrorResponse('缺少合成文本'));
      }
      
      const ttsService = serviceManager.getTTSService();
      const result = await ttsService.synthesize({ text, voice, speed, pitch });
      
      await serviceManager.getLoggingService().info('TTS synthesis completed', {
        textLength: text.length,
        duration: result.duration,
        voice,
      });

      return createCorsResponse(createSuccessResponse(result));
    }
    
  } catch (error) {
    await serviceManager.getLoggingService().error('TTS request failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    return createCorsResponse(createErrorResponse(
      error instanceof Error ? error.message : '语音合成失败'
    ));
  }
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
      if (path === '/api/whisper-asr' || path === '/api/gemini-asr') {
        return await handleASRRequest(request, serviceManager);
      }
      
      if (path === '/api/cosyvoice-tts') {
        return await handleTTSRequest(request, serviceManager);
      }
      
      if (path === '/api/client-logs') {
        return await handleLogsRequest(request, serviceManager);
      }
      
      if (path === '/api/health') {
        return await handleHealthCheck(request, serviceManager);
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