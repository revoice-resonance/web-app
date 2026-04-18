import { LoggingService, LogEntry } from '../types';
import { getCurrentTimestamp, generateId } from '../utils';
import { StorageManager } from '../storage/StorageManager';

/**
 * S3日志服务
 * 将日志存储到S3（Minio）对象存储
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
    const logEntry: any = {
      id: generateId('log'),
      timestamp: getCurrentTimestamp(),
      level,
      message: message.slice(0, 1000), // 限制消息长度
      metadata: this.sanitizeMetadata(metadata),
    };

    try {
      // 保存到S3存储
      await this.storageManager.saveLogs([logEntry]);
      
      // 同时输出到控制台（开发环境）
      this.consoleLog(logEntry);
    } catch (error) {
      // 日志存储失败不影响主流程
      console.error('Failed to save log to S3:', error);
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
      console.error('Failed to get logs from S3:', error);
      return [];
    }
  }

  // 统计日志信息
  async getLogStats(): Promise<{
    total: number;
    byLevel: { info: number; warn: number; error: number };
    recentErrors: number;
  }> {
    try {
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
    } catch (error) {
      console.error('Failed to get log stats:', error);
      return {
        total: 0,
        byLevel: { info: 0, warn: 0, error: 0 },
        recentErrors: 0,
      };
    }
  }

  /**
   * 批量保存日志（用于客户端日志上传）
   */
  async saveClientLogs(logs: LogEntry[]): Promise<void> {
    if (logs.length === 0) return;
    
    try {
      // 为每个日志条目添加ID和时间戳（如果缺失）
      const processedLogs = logs.map(log => ({
        id: (log as any).id || generateId('client-log'),
        timestamp: log.timestamp || getCurrentTimestamp(),
        level: log.level,
        message: log.message.slice(0, 1000),
        metadata: this.sanitizeMetadata(log.metadata),
      }));

      await this.storageManager.saveLogs(processedLogs);
      
      console.log(`Saved ${processedLogs.length} client logs to S3`);
    } catch (error) {
      console.error('Failed to save client logs to S3:', error);
      throw new Error('客户端日志保存失败');
    }
  }

  /**
   * 按时间范围查询日志
   */
  async queryLogs(startTime?: string, endTime?: string, level?: string): Promise<LogEntry[]> {
    try {
      // 获取所有日志（简化实现，实际应该支持时间范围查询）
      const allLogs = await this.getRecentLogs(10000);
      
      return allLogs.filter(log => {
        // 时间范围过滤
        if (startTime && new Date(log.timestamp) < new Date(startTime)) {
          return false;
        }
        if (endTime && new Date(log.timestamp) > new Date(endTime)) {
          return false;
        }
        // 日志级别过滤
        if (level && log.level !== level) {
          return false;
        }
        return true;
      });
    } catch (error) {
      console.error('Failed to query logs:', error);
      return [];
    }
  }
}