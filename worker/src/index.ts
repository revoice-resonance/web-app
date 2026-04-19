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
      // 首先尝试路由匹配
      const routeResponse = await router.match(request, serviceManager);
      if (routeResponse) {
        // 强制检查响应内容
        const clonedResponse = routeResponse.clone();
        const text = await clonedResponse.text();
        // 如果返回内容不是合法的 JSON 但前端以为是，在这里拦截
        if (text.startsWith('-')) {
           console.error(`[CRITICAL] 路由返回了非法数据: ${text}`);
           return createCorsResponse(createErrorResponse(`路由返回非法数据: ${text}`), 500);
        }
        return routeResponse;
      }

      // 如果没有路由匹配，尝试服务静态资源
      return env.ASSETS.fetch(request);

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