/**
 * Project Resonance Worker - 重构版本
 * 采用路由器 + 中间件架构
 */

import { Router } from './router';
import { withErrorHandling } from './middleware';
import { ServiceManager } from './services/ServiceManager';
import { Env } from './types/env';
import { createCorsResponse, createErrorResponse } from './utils';

// Import all handlers
import { handleAudioUploadRequest } from './handlers/audio';
import { handleASRJobSubmitRequest, handleASRJobStatusRequest, handleWhisperASRRequest } from './handlers/asr';
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
router.route('POST', '/api/whisper-asr', withErrorHandling(handleWhisperASRRequest)); // 旧路径：同步 multipart 转录
router.route('GET', '/api/asr/jobs/status', withErrorHandling(handleASRJobStatusRequest));

// TTS相关
router.route('POST', '/api/tts/jobs', withErrorHandling(handleTTSJobSubmitRequest));
router.route('POST', '/api/tts/voice-clone', withErrorHandling(handleVoiceCloneJobSubmitRequest));
router.route('GET', '/api/tts/jobs/status', withErrorHandling(handleTTSJobStatusRequest));

// 日志相关
router.route('GET', '/api/client-logs', withErrorHandling(handleLogsRequest));
router.route('POST', '/api/client-logs', withErrorHandling(handleClientLogsUploadRequest)); // 前端 DiagnosticsPanel 使用
router.route('POST', '/api/logs/client-upload', withErrorHandling(handleClientLogsUploadRequest)); // 旧路径兼容
router.route('GET', '/api/logs/query', withErrorHandling(handleLogsQueryRequest));
router.route('GET', '/api/logs/stats', withErrorHandling(handleLogsStatsRequest));

// 语料相关
router.route('POST', '/api/corpus', withErrorHandling(handleCorpusUploadRequest)); // 前端 useCorpusCollection 使用
router.route('POST', '/api/corpus/upload', withErrorHandling(handleCorpusUploadRequest)); // 旧路径兼容
router.route('POST', '/api/corpus/batch-upload', withErrorHandling(handleCorpusBatchUploadRequest));
router.route('GET', '/api/corpus/query', withErrorHandling(handleCorpusQueryRequest));
router.route('GET', '/api/corpus/stats', withErrorHandling(handleCorpusStatsRequest));

// 健康检查和统计
router.route('GET', '/api/health', withErrorHandling(handleHealthCheck));
router.route('GET', '/api/stats', withErrorHandling(handleStatsRequest));

const MUTATING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

/**
 * 解析允许的 CORS 来源：
 * - 配置了 ALLOWED_ORIGIN → 固定该来源（生产应配置，浏览器会拒绝不匹配的跨域请求）
 * - 未配置 → 回显请求 Origin（仅允许实际调用方，优于通配 '*'）
 */
function resolveAllowedOrigin(env: Env, request: Request): string {
  if (env.ALLOWED_ORIGIN) return env.ALLOWED_ORIGIN;
  return request.headers.get('Origin') || '*';
}

function corsHeaderMap(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, X-API-Key',
    'Access-Control-Max-Age': '86400',
    // 反射 Origin 时必须带 Vary，避免 CDN/代理把某个 Origin 的响应缓存后错发给其他来源
    'Vary': 'Origin',
  };
}

/** 给 API 响应叠加正确的 CORS 头（覆盖 handler 内 createCorsResponse 的通配 ACAO） */
function withCors(origin: string, response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaderMap(origin))) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 初始化服务管理器
    const serviceManager = new ServiceManager(env);
    const url = new URL(request.url);
    const allowedOrigin = resolveAllowedOrigin(env, request);

    try {
      // 鉴权：配置了 API_KEY 时，所有 /api/* 写操作必须携带匹配的 X-API-Key
      if (env.API_KEY && MUTATING_METHODS.has(request.method) && url.pathname.startsWith('/api/')) {
        if (request.headers.get('X-API-Key') !== env.API_KEY) {
          return withCors(allowedOrigin, createCorsResponse(createErrorResponse('Unauthorized'), 401));
        }
      }

      // CORS 预检：在路由匹配 / 静态资源兜底之前统一处理，确保所有 /api/* 跨域预检都返回 204
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaderMap(allowedOrigin) });
      }

      // StepFun TTS 直连通道（需要访问 env.STEPFUN_API_KEY，故在 router 之前 short-circuit）
      if (request.method === 'POST' && url.pathname === '/api/tts/stepfun') {
        return withCors(allowedOrigin, await handleStepFunTTSRequest(request, serviceManager, env));
      }

      // 路由匹配
      const routeResponse = await router.match(request, serviceManager);
      if (routeResponse) {
        return withCors(allowedOrigin, routeResponse);
      }

      // 静态资源兜底：直接透传，不再对二进制资源做 .text() 检查
      // （原实现会把图片/字体/音频整体 decode 成字符串，且以 '-' 开头的合法内容被误判 500）
      return env.ASSETS.fetch(request);
    } catch (error) {
      // 最后的全局错误处理
      await serviceManager.getLoggingService().error('Unhandled error in worker', {
        path: url.pathname,
        error: error instanceof Error ? error.message : String(error)
      });

      return withCors(allowedOrigin, createCorsResponse(createErrorResponse(error instanceof Error ? error.message : String(error)), 500));
    }
  },
};
