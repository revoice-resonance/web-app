import { LoggingService, LogEntry } from '../types';
import { getCurrentTimestamp } from '../utils';

/**
 * 日志服务
 * 提供结构化的日志记录和查询功能
 */
export class LoggingServiceImpl implements LoggingService {
  constructor(private storageManager: any) {}

  async info(message: string, metadata?: Record<string, any>): Promise<void> {
    await this.log('info', message, metadata);
  }

  async warn(message: string, metadata?: Record<string, any>): Promise<void> {
    await this.log('warn', message, metadata);
  }

  async error(message: string, metadata?: Record<string, any>): Promise<void> {
    await this.log('error', message, metadata);
  }

  private async log(level: 'info' | 'warn' | 'error', message: string, metadata?: Record<string, any>): Promise<void> {
    const logEntry: LogEntry = {
      timestamp: getCurrentTimestamp(),
      level,
      message: message.slice(0, 1000), // 限制消息长度
      metadata: this.sanitizeMetadata(metadata),
    };

    // 同时输出到控制台和存储
    this.consoleLog(logEntry);
    
    try {
      await this.storageManager.saveLogs([logEntry]);
    } catch (error) {
      // 日志存储失败不影响主流程
      console.error('Failed to save log:', error);
    }
  }

  private consoleLog(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString();
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}]`;
    
    switch (entry.level) {
      case 'info':
        console.info(prefix, entry.message, entry.metadata || '');
        break;
      case 'warn':
        console.warn(prefix, entry.message, entry.metadata || '');
        break;
      case 'error':
        console.error(prefix, entry.message, entry.metadata || '');
        break;
    }
  }

  private sanitizeMetadata(metadata?: Record<string, any>): Record<string, any> | undefined {
    if (!metadata) return undefined;
    
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(metadata)) {
      // 移除敏感信息
      if (key.toLowerCase().includes('password') || key.toLowerCase().includes('key')) {
        sanitized[key] = '***';
      } else if (typeof value === 'string' && value.length > 500) {
        sanitized[key] = value.slice(0, 500) + '...';
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  async getRecentLogs(limit = 100): Promise<LogEntry[]> {
    try {
      return await this.storageManager.getLogs(limit);
    } catch (error) {
      console.error('Failed to get logs:', error);
      return [];
    }
  }

  // 统计日志信息
  async getLogStats(): Promise<{
    total: number;
    byLevel: { info: number; warn: number; error: number };
    recentErrors: number;
  }> {
    const logs = await this.getRecentLogs(1000); // 获取最近1000条
    
    const byLevel = { info: 0, warn: 0, error: 0 };
    let recentErrors = 0;
    
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    for (const log of logs) {
      byLevel[log.level]++;
      
      if (log.level === 'error' && new Date(log.timestamp).getTime() > oneHourAgo) {
        recentErrors++;
      }
    }
    
    return {
      total: logs.length,
      byLevel,
      recentErrors,
    };
  }
}