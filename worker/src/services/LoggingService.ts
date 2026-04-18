import { LoggingService, LogEntry } from '../types';

/**
 * 禁用日志服务
 * 所有日志方法都是空操作，不记录任何日志
 */
export class LoggingServiceImpl implements LoggingService {
  constructor(private storageManager: any) {}

  async info(message: string, metadata?: Record<string, any>): Promise<void> {
    // 空操作，不记录日志
  }

  async warn(message: string, metadata?: Record<string, any>): Promise<void> {
    // 空操作，不记录日志
  }

  async error(message: string, metadata?: Record<string, any>): Promise<void> {
    // 空操作，不记录日志
  }

  async getRecentLogs(limit = 100): Promise<LogEntry[]> {
    // 空操作，返回空数组
    return [];
  }

  // 统计日志信息
  async getLogStats(): Promise<{
    total: number;
    byLevel: { info: number; warn: number; error: number };
    recentErrors: number;
  }> {
    // 空操作，返回空统计
    return {
      total: 0,
      byLevel: { info: 0, warn: 0, error: 0 },
      recentErrors: 0,
    };
  }
}