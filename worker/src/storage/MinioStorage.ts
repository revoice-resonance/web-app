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
      region: env.MINIO_REGION || 'LHR',
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
  private async uploadToMinio(objectKey: string, data: ArrayBuffer | Uint8Array, contentType?: string, metadata?: Record<string, any>): Promise<void> {
    const url = this.buildMinioUrl(objectKey);
    
    const headers: Record<string, string> = {
      'Authorization': `AWS ${this.config.accessKey}:${this.generateSignature('PUT', objectKey)}`,
      'Content-Type': contentType || 'application/octet-stream',
      'Content-Length': data.byteLength.toString(),
    };

    // 添加自定义元数据
    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          headers[`x-amz-meta-${key}`] = String(value);
        }
      });
    }

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
   * 生成 Basic Auth 签名
   */
  private generateAuthHeader(): string {
    const creds = `${this.config.accessKey}:${this.config.secretKey}`;
    return `Basic ${btoa(creds)}`;
  }

  /**
   * 上传文件到Minio
   */
  private async uploadToMinio(objectKey: string, data: ArrayBuffer | Uint8Array, contentType?: string, metadata?: Record<string, any>): Promise<void> {
    const url = this.buildMinioUrl(objectKey);

    const headers: Record<string, string> = {
      'Authorization': this.generateAuthHeader(),
      'Content-Type': contentType || 'application/octet-stream',
      'Content-Length': data.byteLength.toString(),
    };

    // 添加自定义元数据
    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          headers[`x-amz-meta-${key}`] = String(value);
        }
      });
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: data,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Minio upload failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
  }

  /**
   * 从Minio下载文件
   */
  private async downloadFromMinio(objectKey: string): Promise<ArrayBuffer | null> {
    const url = this.buildMinioUrl(objectKey);

    const headers: Record<string, string> = {
      'Authorization': this.generateAuthHeader(),
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

  async deleteObject(key: string): Promise<void> {
    const url = this.buildMinioUrl(key);

    const headers: Record<string, string> = {
      'Authorization': this.generateAuthHeader(),
    };

    const response = await fetch(url, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Minio delete failed: ${response.status} ${response.statusText}`);
    }
  }

  async getObjectMetadata(key: string): Promise<Record<string, any> | null> {
    const url = this.buildMinioUrl(key);

    const headers: Record<string, string> = {
      'Authorization': this.generateAuthHeader(),
    };

    const response = await fetch(url, {
      method: 'HEAD',
      headers,
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Minio metadata fetch failed: ${response.status} ${response.statusText}`);
    }

    const metadata: Record<string, any> = {};
    response.headers.forEach((value, key) => {
      if (key.toLowerCase().startsWith('x-amz-meta-')) {
        metadata[key.substring(11)] = value;
      }
    });

    return metadata;
  }

  async listObjects(prefix?: string, limit: number = 100): Promise<{ key: string; size: number; lastModified: string }[]> {
    // 简化实现，Minio不支持直接列表，需要额外实现
    // 实际项目中应使用Minio SDK或维护索引
    console.log('List objects with prefix:', prefix, 'limit:', limit);
    return [];
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