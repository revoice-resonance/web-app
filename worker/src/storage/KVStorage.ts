import { StorageService, TranscriptionResult, LogEntry } from '../types';

interface Env {
  RESONANCE_KV: KVNamespace;
}

/**
 * Cloudflare KV 存储服务 - 用于生产环境
 * 提供持久化存储能力
 */
export class KVStorage implements StorageService {
  constructor(private env: Env) {}

  private getAudioKey(key: string): string {
    return `audio:${key}`;
  }

  private getTranscriptionKey(key: string): string {
    return `transcription:${key}`;
  }

  private getLogsKey(): string {
    return 'logs';
  }

  async saveAudio(key: string, audio: ArrayBuffer, metadata?: Record<string, any>): Promise<{ url: string; key: string }> {
    const storageKey = this.getAudioKey(key);
    await this.env.RESONANCE_KV.put(storageKey, this.arrayBufferToBase64(audio), {
      expirationTtl: 24 * 60 * 60, // 24小时过期
    });
    return {
      url: `kv://${storageKey}`,
      key: storageKey
    };
  }

  async getAudio(key: string): Promise<ArrayBuffer | null> {
    const storageKey = this.getAudioKey(key);
    const base64Data = await this.env.RESONANCE_KV.get(storageKey);
    
    if (!base64Data) return null;
    
    return this.base64ToArrayBuffer(base64Data);
  }

  async deleteAudio(key: string): Promise<void> {
    const storageKey = this.getAudioKey(key);
    await this.env.RESONANCE_KV.delete(storageKey);
  }

  async saveTranscription(key: string, result: TranscriptionResult): Promise<{ url: string; key: string }> {
    const storageKey = this.getTranscriptionKey(key);
    await this.env.RESONANCE_KV.put(storageKey, JSON.stringify(result), {
      expirationTtl: 7 * 24 * 60 * 60, // 7天过期
    });
    return {
      url: `kv://${storageKey}`,
      key: storageKey
    };
  }

  async getTranscription(key: string): Promise<TranscriptionResult | null> {
    const storageKey = this.getTranscriptionKey(key);
    const data = await this.env.RESONANCE_KV.get(storageKey);
    
    if (!data) return null;
    
    try {
      return JSON.parse(data) as TranscriptionResult;
    } catch {
      return null;
    }
  }

  async saveLogs(logs: LogEntry[]): Promise<void> {
    if (logs.length === 0) return;
    
    const existingLogs = await this.getLogs();
    const allLogs = [...existingLogs, ...logs].slice(-1000); // 限制1000条
    
    await this.env.RESONANCE_KV.put(
      this.getLogsKey(),
      JSON.stringify(allLogs),
      { expirationTtl: 30 * 24 * 60 * 60 } // 30天过期
    );
  }

  async getLogs(limit = 100): Promise<LogEntry[]> {
    const data = await this.env.RESONANCE_KV.get(this.getLogsKey());
    
    if (!data) return [];
    
    try {
      const logs = JSON.parse(data) as LogEntry[];
      return logs.slice(-limit);
    } catch {
      return [];
    }
  }

  // 工具函数：ArrayBuffer 转 Base64
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // 工具函数：Base64 转 ArrayBuffer
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // 统计信息
  async getStats(): Promise<{
    audioCount: number;
    transcriptionCount: number;
    logCount: number;
  }> {
    // 注意：KV 没有直接的计数功能，这里简化实现
    // 实际项目中可能需要维护计数器
    const logs = await this.getLogs(1);
    return {
      audioCount: 0, // 需要额外实现
      transcriptionCount: 0, // 需要额外实现
      logCount: logs.length,
    };
  }

  // 清理过期数据（KV自动处理过期）
  async cleanup(): Promise<void> {
    // KV 自动处理过期，无需手动清理
  }
}