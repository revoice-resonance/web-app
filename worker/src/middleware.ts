import { ServiceManager } from './services/ServiceManager';

export type MiddlewareHandler = (request: Request, serviceManager: ServiceManager) => Promise<Response | null>;
export type RequestHandler = (request: Request, serviceManager: ServiceManager) => Promise<Response>;

/**
 * 中间件类
 */
export class Middleware {
  private middlewares: MiddlewareHandler[] = [];

  /**
   * 添加中间件
   */
  use(middleware: MiddlewareHandler): void {
    this.middlewares.push(middleware);
  }

  /**
   * 执行中间件链
   */
  async execute(request: Request, serviceManager: ServiceManager, finalHandler: RequestHandler): Promise<Response> {
    let index = 0;

    const next = async (): Promise<Response> => {
      if (index < this.middlewares.length) {
        const middleware = this.middlewares[index++];
        const result = await middleware(request, serviceManager);
        if (result) {
          return result; // 中间件返回响应，提前结束
        }
        return next(); // 继续下一个中间件
      } else {
        // 执行最终处理器
        return finalHandler(request, serviceManager);
      }
    };

    return next();
  }
}

/**
 * CORS 中间件
 */
export function corsMiddleware(request: Request, serviceManager: ServiceManager): Promise<Response | null> {
  if (request.method === 'OPTIONS') {
    return Promise.resolve(createCorsResponse());
  }
  return Promise.resolve(null);
}

/**
 * 错误处理中间件包装器
 */
export function withErrorHandling(handler: RequestHandler): RequestHandler {
  return async (request: Request, serviceManager: ServiceManager): Promise<Response> => {
    try {
      return await handler(request, serviceManager);
    } catch (error) {
      await serviceManager.getLoggingService().error('Unhandled error in handler', {
        path: new URL(request.url).pathname,
        method: request.method,
        error: error instanceof Error ? error.message : String(error)
      });

      return createCorsResponse(createErrorResponse('Internal server error'), 500);
    }
  };
}

// 工具函数 - CORS 响应
function createCorsResponse(response?: Response, status?: number): Response {
  const res = response || new Response(null, { status: status || 200 });

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };

  // 如果已经有响应，复制其内容
  if (response) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: { ...Object.fromEntries(response.headers), ...corsHeaders }
    });
  }

  return new Response(null, {
    status: status || 200,
    headers: corsHeaders
  });
}

// 工具函数 - 成功响应
function createSuccessResponse(data: any): Response {
  return new Response(JSON.stringify({
    success: true,
    data
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// 工具函数 - 错误响应
function createErrorResponse(message: string): Response {
  return new Response(JSON.stringify({
    success: false,
    error: message
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}