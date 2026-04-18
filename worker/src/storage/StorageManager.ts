import { StorageService } from '../types';
import { createStorageService } from './index';

interface Env {
  MINIO_ENDPOINT?: string;
  MINIO_ACCESS_KEY?: string;
  MINIO_SECRET_KEY?: string;
  MINIO_BUCKET_NAME?: string;
}

/**
 * 存储管理器
 * 统一管理存储服务实例
 */
export class StorageManager {
  private storageService: StorageService;

  constructor(env: Env) {
    this.storageService = createStorageService(env);
  }

  // 音频文件管理
  async saveAudio(key: string, audio: ArrayBuffer, metadata?: Record<string, any>): Promise<{ url: string; key: string }> {
    return this.storageService.saveAudio(key, audio, metadata);
  }

  async getAudio(key: string): Promise<ArrayBuffer | null> {
    return this.storageService.getAudio(key);
  }

  async deleteAudio(key: string): Promise<void> {
    return this.storageService.deleteAudio(key);
  }

  // 转录结果管理
  async saveTranscription(key: string, result: any): Promise<{ url: string; key: string }> {
    return this.storageService.saveTranscription(key, result);
  }

  async getTranscription(key: string): Promise<any | null> {
    return this.storageService.getTranscription(key);
  }

  // 日志管理
  async saveLogs(logs: any[]): Promise<void> {
    return this.storageService.saveLogs(logs);
  }

  async getLogs(limit?: number): Promise<any[]> {
    return this.storageService.getLogs(limit);
  }

  // 通用对象管理
  async putObject(key: string, data: ArrayBuffer | string, contentType?: string): Promise<{ url: string; key: string }> {
    return this.storageService.putObject(key, data, contentType);
  }

  async getObject(key: string): Promise<ArrayBuffer | null> {
    return this.storageService.getObject(key);
  }

  async deleteObject(key: string): Promise<void> {
    return this.storageService.deleteObject(key);
  }

  // 获取存储类型
  getStorageType(): string {
    if (this.storageService.constructor.name === 'MinioStorage') {
      return 'minio';
    } else {
      return 'memory';
    }
  }
}