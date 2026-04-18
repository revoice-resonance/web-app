import { StorageService } from '../types';
import { MemoryStorage } from './MemoryStorage';
import { KVStorage } from './KVStorage';
import { MinioStorage } from './MinioStorage';

interface Env {
  RESONANCE_KV?: KVNamespace;
  MINIO_ENDPOINT?: string;
  MINIO_ACCESS_KEY?: string;
  MINIO_SECRET_KEY?: string;
  MINIO_BUCKET_NAME?: string;
}

/**
 * 存储服务工厂
 * 根据环境自动选择合适的存储实现
 */
export function createStorageService(env: Env): StorageService {
  // 优先使用 Minio 存储（如果配置了Minio环境变量）
  if (env.MINIO_ENDPOINT && env.MINIO_ACCESS_KEY && env.MINIO_SECRET_KEY && env.MINIO_BUCKET_NAME) {
    return new MinioStorage(env as any);
  }
  
  // 其次使用 KV 存储
  if (env.RESONANCE_KV) {
    return new KVStorage(env);
  }
  
  // 否则使用内存存储（开发环境）
  return new MemoryStorage();
}

/**
 * 存储服务管理器
 * 提供统一的存储接口和错误处理
 */
export class StorageManager {
  private storage: StorageService;

  constructor(env: Env) {
    this.storage = createStorageService(env);
  }

  async saveAudio(key: string, audio: ArrayBuffer): Promise<void> {
    try {
      await this.storage.saveAudio(key, audio);
    } catch (error) {
      console.error('Failed to save audio:', error);
      throw new Error('音频存储失败');
    }
  }

  async getAudio(key: string): Promise<ArrayBuffer | null> {
    try {
      return await this.storage.getAudio(key);
    } catch (error) {
      console.error('Failed to get audio:', error);
      return null;
    }
  }

  async deleteAudio(key: string): Promise<void> {
    try {
      await this.storage.deleteAudio(key);
    } catch (error) {
      console.error('Failed to delete audio:', error);
      throw new Error('音频删除失败');
    }
  }

  async saveTranscription(key: string, result: any): Promise<void> {
    try {
      await this.storage.saveTranscription(key, result);
    } catch (error) {
      console.error('Failed to save transcription:', error);
      throw new Error('转录结果存储失败');
    }
  }

  async getTranscription(key: string): Promise<any | null> {
    try {
      return await this.storage.getTranscription(key);
    } catch (error) {
      console.error('Failed to get transcription:', error);
      return null;
    }
  }

  async saveLogs(logs: any[]): Promise<void> {
    try {
      await this.storage.saveLogs(logs);
    } catch (error) {
      console.error('Failed to save logs:', error);
      // 日志存储失败不抛出错误，避免影响主流程
    }
  }

  async getLogs(limit?: number): Promise<any[]> {
    try {
      return await this.storage.getLogs(limit);
    } catch (error) {
      console.error('Failed to get logs:', error);
      return [];
    }
  }

  // 获取存储类型信息
  getStorageType(): string {
    return this.storage instanceof KVStorage ? 'KV' : 'Memory';
  }
}