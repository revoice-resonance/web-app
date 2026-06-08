/**
 * Project Resonance Worker - 重构版本
 * 采用路由器 + 中间件架构
 */

import { Router } from './router';
import { Middleware, corsMiddleware, withErrorHandling } from './middleware';
import { ServiceManager } from './services/ServiceManager';
import { Env } from './types/env';
import { createCorsResponse, createSuccessResponse, createErrorResponse } from './utils';

// Import all handlers
import { handleAudioUploadRequest } from './handlers/audio';
import { handleASRJobSubmitRequest, handleASRJobStatusRequest } from './handlers/asr';
import { handleTTSJobSubmitRequest, handleVoiceCloneJobSubmitRequest, handleTTSJobStatusRequest } from './handlers/tts';
import { handleStepFunTTSRequest } from './handlers/stepfunTts';
import { handleLogsRequest, handleClientLogsUploadRequest, handleLogsQueryRequest, handleLogsStatsRequest } from './handlers/logs';
import { handleCorpusUploadRequest, handleCorpusBatchUploadRequest, handleCorpusQueryRequest, handleCorpusStatsRequest } from './handlers/corpus';
import { handleHealthCheck, handleStatsRequest } from './handlers/health';

// 创建路由器
const router = new Router();

// 注册路由 - 音频相关
router.route('POST', '/api/audio/upload', withErrorHandling(handleAudioUploadRequest));

// ASR相关
router.route('POST', '/api/asr/jobs', withErrorHandling(handleASRJobSubmitRequest));
router.route('POST', '/api/whisper-asr', withErrorHandling(handleASRJobSubmitRequest)); // 兼容旧路径
router.route('GET', '/api/asr/jobs/status', withErrorHandling(handleASRJobStatusRequest));

// TTS相关
router.route('POST', '/api/tts/jobs', withErrorHandling(handleTTSJobSubmitRequest));
router.route('POST', '/api/tts/voice-clone', withErrorHandling(handleVoiceCloneJobSubmitRequest));
router.route('GET', '/api/tts/jobs/status', withErrorHandling(handleTTSJobStatusRequest));

// 日志相关
router.route('GET', '/api/client-logs', withErrorHandling(handleLogsRequest));
router.route('POST', '/api/logs/client-upload', withErrorHandling(handleClientLogsUploadRequest));
router.route('GET', '/api/logs/query', withErrorHandling(handleLogsQueryRequest));
router.route('GET', '/api/logs/stats', withErrorHandling(handleLogsStatsRequest));

// 语料相关
router.route('POST', '/api/corpus/upload', withErrorHandling(handleCorpusUploadRequest));
router.route('POST', '/api/corpus/batch-upload', withErrorHandling(handleCorpusBatchUploadRequest));
router.route('GET', '/api/corpus/query', withErrorHandling(handleCorpusQueryRequest));
router.route('GET', '/api/corpus/stats', withErrorHandling(handleCorpusStatsRequest));

// 健康检查和统计
router.route('GET', '/api/health', withErrorHandling(handleHealthCheck));
router.route('GET', '/api/stats', withErrorHandling(handleStatsRequest));

// 创建中间件
const middleware = new Middleware();
middleware.use(corsMiddleware);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 初始化服务管理器
    const serviceManager = new ServiceManager(env);

    try {
      // StepFun TTS 直连通道（需要访问 env.STEPFUN_API_KEY，故在 router 之前 short-circuit）
      const url = new URL(request.url);
      if (request.method === 'OPTIONS' && url.pathname === '/api/tts/stepfun') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
          },
        });
      }
      if (request.method === 'POST' && url.pathname === '/api/tts/stepfun') {
        return await handleStepFunTTSRequest(request, serviceManager, env);
      }

      // 首先尝试路由匹配
      const routeResponse = await router.match(request, serviceManager);
      const response = routeResponse || await env.ASSETS.fetch(request);

      // 强制克隆一份检查内容
      const cloned = response.clone();
      const text = await cloned.text();
      if (text.trim().startsWith('-')) {
        return createCorsResponse(createErrorResponse(`Worker 返回了无效数据: ${text.substring(0, 50)}`), 500);
      }

      return response;
    } catch (error) {
      // 最后的全局错误处理
      await serviceManager.getLoggingService().error('Unhandled error in worker', {
        path: new URL(request.url).pathname,
        error: error instanceof Error ? error.message : String(error)
      });

      return createCorsResponse(createErrorResponse(error instanceof Error ? error.message : String(error)), 500);
    }
  },
};