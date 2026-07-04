import { ServiceManager } from '../services/ServiceManager';
import { createCorsResponse, createSuccessResponse, createErrorResponse } from '../utils';

/**
 * 处理日志查询请求
 */
export async function handleLogsRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
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
 * 处理客户端日志上传请求
 */
export async function handleClientLogsUploadRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
  if (request.method !== 'POST') {
    return createCorsResponse(createErrorResponse('Method not allowed'), 405);
  }

  try {
    const body = await request.json();

    // 前端 DiagnosticsPanel 发送字段 'entries'，旧路径用 'logs'，二者兼容
    const rawLogs = (body as any).entries ?? (body as any).logs;
    if (!Array.isArray(rawLogs)) {
      return createCorsResponse(createErrorResponse('请求格式错误，需要 entries/logs 数组'), 400);
    }

    // 前端条目形状 { ts, level, message } → worker LogEntry { timestamp, level, message, metadata }
    // 前端 level 含 'log'，worker 仅允许 info|warn|error；未知值兜底为 'info'
    const normalizeLevel = (lvl: string): 'info' | 'warn' | 'error' => {
      if (lvl === 'warn' || lvl === 'error') return lvl;
      return 'info';
    };
    const requestMeta = {
      ...(body as any).ua ? { ua: (body as any).ua } : {},
      ...(body as any).url ? { url: (body as any).url } : {},
      ...(body as any).ts ? { clientTs: (body as any).ts } : {},
    };
    const logs = rawLogs.map((e: any) => ({
      timestamp: e.ts || e.timestamp || new Date().toISOString(),
      level: normalizeLevel(e.level),
      message: typeof e.message === 'string' ? e.message : JSON.stringify(e.message ?? ''),
      ...(Object.keys(requestMeta).length ? { metadata: requestMeta } : {}),
    }));

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
export async function handleLogsQueryRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
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
export async function handleLogsStatsRequest(request: Request, serviceManager: ServiceManager): Promise<Response> {
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