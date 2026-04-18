import { StorageService, TranscriptionResult, LogEntry } from '../types';

interface MinioConfig {
  endpoint: string;
  port?: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucketName: string;
  region?: string;
}

interface Env {
  MINIO_ENDPOINT: string;
  MINIO_PORT?: string;
  MINIO_USE_SSL?: string;
  MINIO_ACCESS_KEY: string;
  MINIO_SECRET_KEY: string;
  MINIO_BUCKET_NAME: string;
  MINIO_REGION?: string;
}

/**
 * Minio 对象存储服务
 * 用于语料数据的持久化存储
 */
export class MinioStorage implements StorageService {
  private config: MinioConfig;
  private bucketName: string;

  constructor(env: Env) {
    this.config = {
      endpoint: env.MINIO_ENDPOINT,
      port: env.MINIO_PORT ? parseInt(env.MINIO_PORT) : 9000,
      useSSL: env.MINIO_USE_SSL === 'true',
      accessKey: env.MINIO_ACCESS_KEY,
      secretKey: env.MINIO_SECRET_KEY,
      bucketName: env.MINIO_BUCKET_NAME,
      region: env.MINIO_REGION || 'us-east-1',
    };
    this.bucketName = this.config.bucketName;
  }

  /**
   * 生成Minio对象键
   */
  private generateObjectKey(prefix: string, key: string, extension?: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const ext = extension || 'bin';
    return `${prefix}/${timestamp}_${random}_${key}.${ext}`;
  }

  /**
   * 构建Minio URL
   */
  private buildMinioUrl(objectKey: string): string {
    const { endpoint, port, useSSL } = this.config;
    const protocol = useSSL ? 'https' : 'http';
    const host = port ? `${endpoint}:${port}` : endpoint;
    return `${protocol}://${host}/${this.bucketName}/${objectKey}`;
  }

  /**
   * 上传文件到Minio
   */
  private async uploadToMinio(objectKey: string, data: ArrayBuffer, contentType?: string): Promise<void> {
    const url = this.buildMinioUrl(objectKey);
    
    const headers: Record<string, string> = {
      'Authorization': `AWS ${this.config.accessKey}:${this.generateSignature('PUT', objectKey)}`,
      'Content-Type': contentType || 'application/octet-stream',
      'Content-Length': data.byteLength.toString(),
    };

    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: data,
    });

    if (!response.ok) {
      throw new Error(`Minio upload failed: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * 从Minio下载文件
   */
  private async downloadFromMinio(objectKey: string): Promise<ArrayBuffer | null> {
    const url = this.buildMinioUrl(objectKey);
    
    const headers: Record<string, string> = {
      'Authorization': `AWS ${this.config.accessKey}:${this.generateSignature('GET', objectKey)}`,
    };

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Minio download failed: ${response.status} ${response.statusText}`);
    }

    return await response.arrayBuffer();
  }

  /**
   * 生成AWS签名（简化版）
   */
  private generateSignature(method: string, objectKey: string): string {
    // 简化签名实现，实际项目中应使用完整的AWS签名算法
    const timestamp = new Date().toISOString().replace(/[^0-9TZ]/g, '');
    const stringToSign = `${method}\n\n\n${timestamp}\n/${this.bucketName}/${objectKey}`;
    
    // 使用HMAC-SHA256生成签名
    // 这里简化处理，实际应使用完整的签名算法
    return btoa(`${timestamp}:${this.config.secretKey}`);
  }

  async saveAudio(key: string, audio: ArrayBuffer): Promise<void> {
    const objectKey = this.generateObjectKey('audio', key, 'wav');
    await this.uploadToMinio(objectKey, audio, 'audio/wav');
  }

  async getAudio(key: string): Promise<ArrayBuffer | null> {
    // 由于Minio使用对象键而不是简单key，这里需要额外的映射机制
    // 简化实现：假设key就是对象键的一部分
    const objectKey = `audio/${key}`;
    return await this.downloadFromMinio(objectKey);
  }

  async deleteAudio(key: string): Promise<void> {
    const objectKey = `audio/${key}`;
    const url = this.buildMinioUrl(objectKey);
    
    const headers: Record<string, string> = {
      'Authorization': `AWS ${this.config.accessKey}:${this.generateSignature('DELETE', objectKey)}`,
    };

    const response = await fetch(url, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Minio delete failed: ${response.status} ${response.statusText}`);
    }
  }

  async saveTranscription(key: string, result: TranscriptionResult): Promise<void> {
    const objectKey = this.generateObjectKey('transcriptions', key, 'json');
    const data = new TextEncoder().encode(JSON.stringify(result));
    await this.uploadToMinio(objectKey, data, 'application/json');
  }

  async getTranscription(key: string): Promise<TranscriptionResult | null> {
    const objectKey = `transcriptions/${key}`;
    const data = await this.downloadFromMinio(objectKey);
    
    if (!data) return null;
    
    try {
      const text = new TextDecoder().decode(data);
      return JSON.parse(text) as TranscriptionResult;
    } catch {
      return null;
    }
  }

  async saveLogs(logs: LogEntry[]): Promise<void> {
    if (logs.length === 0) return;
    
    const timestamp = Date.now();
    const objectKey = this.generateObjectKey('logs', `batch_${timestamp}`, 'json');
    const data = new TextEncoder().encode(JSON.stringify(logs));
    await this.uploadToMinio(objectKey, data, 'application/json');
  }

  async getLogs(limit?: number): Promise<LogEntry[]> {
    // Minio不支持直接查询，这里返回空数组
    // 实际项目中可能需要维护索引或使用其他查询机制
    return [];
  }

  /**
   * 检查Minio连接状态
   */
  async healthCheck(): Promise<boolean> {
    try {
      const testKey = 'healthcheck/test';
      const testData = new TextEncoder().encode('test');
      await this.uploadToMinio(testKey, testData);
      await this.deleteAudio(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取存储统计信息
   */
  async getStorageStats(): Promise<{
    bucketName: string;
    endpoint: string;
    isConnected: boolean;
  }> {
    const isConnected = await this.healthCheck();
    
    return {
      bucketName: this.bucketName,
      endpoint: this.config.endpoint,
      isConnected,
    };
  }
}