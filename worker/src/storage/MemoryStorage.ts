import { StorageService, TranscriptionResult, LogEntry } from '../types';

/**
 * 内存存储服务 - 用于开发环境
 * 注意：Cloudflare Workers 重启后会丢失数据
 */
export class MemoryStorage implements StorageService {
  private audioStorage: Map<string, ArrayBuffer> = new Map();
  private transcriptionStorage: Map<string, TranscriptionResult> = new Map();
  private logStorage: LogEntry[] = [];
  private maxLogEntries = 1000;

  async saveAudio(key: string, audio: ArrayBuffer, metadata?: Record<string, any>): Promise<{ url: string; key: string }> {
    this.audioStorage.set(key, audio);
    return {
      url: `memory://${key}`,
      key
    };
  }

  async getAudio(key: string): Promise<ArrayBuffer | null> {
    return this.audioStorage.get(key) || null;
  }

  async deleteAudio(key: string): Promise<void> {
    this.audioStorage.delete(key);
  }

  async saveTranscription(key: string, result: TranscriptionResult): Promise<{ url: string; key: string }> {
    this.transcriptionStorage.set(key, result);
    return {
      url: `memory://${key}`,
      key
    };
  }

  async getTranscription(key: string): Promise<TranscriptionResult | null> {
    return this.transcriptionStorage.get(key) || null;
  }

  async saveLogs(logs: LogEntry[]): Promise<void> {
    this.logStorage.push(...logs);
    
    // 限制日志数量
    if (this.logStorage.length > this.maxLogEntries) {
      this.logStorage = this.logStorage.slice(-this.maxLogEntries);
    }
  }

  async getLogs(limit = 100): Promise<LogEntry[]> {
    return this.logStorage.slice(-limit);
  }

  // 统计信息
  getStats() {
    return {
      audioCount: this.audioStorage.size,
      transcriptionCount: this.transcriptionStorage.size,
      logCount: this.logStorage.length,
    };
  }

  // 清理过期数据（基于时间戳）
  async cleanup(olderThanHours = 24): Promise<void> {
    const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
    
    // 清理日志
    this.logStorage = this.logStorage.filter(
      log => new Date(log.timestamp).getTime() > cutoffTime
    );
    
    // 注意：内存存储无法基于时间清理音频和转录数据
    // 因为缺少时间戳信息，实际项目中应使用持久化存储
  }
}