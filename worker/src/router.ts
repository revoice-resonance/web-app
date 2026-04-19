import { ServiceManager } from './services/ServiceManager';

/**
 * 简单的路由器实现
 */
export class Router {
  private routes: Map<string, Map<string, RouteHandler>> = new Map();

  /**
   * 注册路由
   */
  route(method: string, path: string, handler: RouteHandler): void {
    if (!this.routes.has(method)) {
      this.routes.set(method, new Map());
    }
    this.routes.get(method)!.set(path, handler);
  }

  /**
   * 匹配路由并执行处理器
   */
  async match(request: Request, serviceManager: ServiceManager): Promise<Response | null> {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    const methodRoutes = this.routes.get(method);
    if (!methodRoutes) return null;

    const handler = methodRoutes.get(path);
    if (!handler) return null;

    return handler(request, serviceManager);
  }

  /**
   * 获取所有注册的路由（用于调试）
   */
  getRoutes(): string[] {
    const routes: string[] = [];
    for (const [method, paths] of this.routes) {
      for (const path of paths.keys()) {
        routes.push(`${method} ${path}`);
      }
    }
    return routes;
  }
}

export type RouteHandler = (request: Request, serviceManager: ServiceManager) => Promise<Response>;