import { StorageService, TranscriptionResult, LogEntry } from '../types';
import { signS3Request } from '../utils/s3-signer';


interface MinioConfig {
  endpoint?: string;
  vpc?: Fetcher;
  port?: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucketName: string;
  region?: string;
}

interface Env {
  MINIO_ENDPOINT?: string;
  MINIO_VPC?: Fetcher;
  MINIO_PORT?: string;
  MINIO_USE_SSL?: string;
  MINIO_ACCESS_KEY: string;
  MINIO_SECRET_KEY: string;
  MINIO_BUCKET_NAME: string;
  MINIO_REGION?: string;
}

export class MinioStorage implements StorageService {
  private config: MinioConfig;
  private bucketName: string;

  constructor(env: Env) {
    this.config = {
      endpoint: env.MINIO_ENDPOINT,
      vpc: env.MINIO_VPC,
      port: env.MINIO_PORT ? parseInt(env.MINIO_PORT) : 9000,
      useSSL: env.MINIO_USE_SSL === 'true',
      accessKey: env.MINIO_ACCESS_KEY,
      secretKey: env.MINIO_SECRET_KEY,
      bucketName: env.MINIO_BUCKET_NAME,
      region: env.MINIO_REGION || 'LHR',
    };
    this.bucketName = this.config.bucketName;
  }

  private generateObjectKey(prefix: string, key: string, extension?: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const ext = extension || 'bin';
    return `${prefix}/${timestamp}_${random}_${key}.${ext}`;
  }

  private buildMinioUrl(objectKey: string): string {
    const { endpoint, port, useSSL } = this.config;
    const protocol = useSSL ? 'https' : 'http';
    const host = port ? `${endpoint}:${port}` : endpoint;
    return `${protocol}://${host}/${this.bucketName}/${objectKey}`;
  }

  private async getSignedHeaders(method: string, url: string, payload: ArrayBuffer, headers: Record<string, string> = {}): Promise<Record<string, string>> {
    return await signS3Request(
      method,
      url,
      { ...headers },
      payload,
      this.config.accessKey,
      this.config.secretKey,
      this.config.region || 'us-east-1'
    );
  }

  private async uploadToMinio(objectKey: string, data: ArrayBuffer | Uint8Array, contentType?: string, metadata?: Record<string, any>): Promise<void> {
    const url = this.buildMinioUrl(objectKey);
    let headers: Record<string, string> = {
      'Content-Type': contentType || 'application/octet-stream',
      'Content-Length': data.byteLength.toString(),
    };
    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          headers[`x-amz-meta-${key}`] = String(value);
        }
      });
    }

    const bufferData = data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
    headers = await this.getSignedHeaders('PUT', url, bufferData as ArrayBuffer, headers);

    const response = await fetch(url, { method: 'PUT', headers, body: data });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Minio upload failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
  }

  private async downloadFromMinio(objectKey: string): Promise<ArrayBuffer | null> {
    const url = this.buildMinioUrl(objectKey);
    const headers = await this.getSignedHeaders('GET', url, new ArrayBuffer(0));

    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Minio download failed: ${response.status} ${response.statusText}`);
    }
    return await response.arrayBuffer();
  }

  async saveAudio(key: string, audio: ArrayBuffer, metadata?: Record<string, any>): Promise<{ url: string; key: string }> {
    const objectKey = this.generateObjectKey('audio', key, 'wav');
    await this.uploadToMinio(objectKey, audio, 'audio/wav', metadata);
    return { url: this.buildMinioUrl(objectKey), key: objectKey };
  }

  async getAudio(key: string): Promise<ArrayBuffer | null> {
    return await this.downloadFromMinio(key);
  }

  async deleteAudio(key: string): Promise<void> {
    await this.deleteObject(key);
  }

  async saveTranscription(key: string, result: TranscriptionResult): Promise<{ url: string; key: string }> {
    const objectKey = this.generateObjectKey('transcriptions', key, 'json');
    await this.uploadToMinio(objectKey, new TextEncoder().encode(JSON.stringify(result)), 'application/json');
    return { url: this.buildMinioUrl(objectKey), key: objectKey };
  }

  async getTranscription(key: string): Promise<TranscriptionResult | null> {
    const data = await this.downloadFromMinio(key);
    if (!data) return null;
    try {
      return JSON.parse(new TextDecoder().decode(data)) as TranscriptionResult;
    } catch { return null; }
  }

  async putObject(key: string, data: ArrayBuffer | string, contentType?: string): Promise<{ url: string; key: string }> {
    const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    await this.uploadToMinio(key, buffer, contentType);
    return { url: this.buildMinioUrl(key), key: key };
  }

  async getObject(key: string): Promise<ArrayBuffer | null> {
    return await this.downloadFromMinio(key);
  }

  async deleteObject(key: string): Promise<void> {
    const url = this.buildMinioUrl(key);
    const headers = await this.getSignedHeaders('DELETE', url, new ArrayBuffer(0));
    const response = await fetch(url, { method: 'DELETE', headers });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Minio delete failed: ${response.status} ${response.statusText}`);
    }
  }

  async getObjectMetadata(key: string): Promise<Record<string, any> | null> {
    const url = this.buildMinioUrl(key);
    const headers = await this.getSignedHeaders('HEAD', url, new ArrayBuffer(0));
    const response = await fetch(url, { method: 'HEAD', headers });
    if (!response.ok) return response.status === 404 ? null : null;
    const metadata: Record<string, any> = {};
    response.headers.forEach((value, k) => {
      if (k.toLowerCase().startsWith('x-amz-meta-')) metadata[k.substring(11)] = value;
    });
    return metadata;
  }

  async saveLogs(logs: LogEntry[]): Promise<void> {
    if (logs.length === 0) return;
    const objectKey = this.generateObjectKey('logs', `batch_${Date.now()}`, 'json');
    await this.uploadToMinio(objectKey, new TextEncoder().encode(JSON.stringify(logs)), 'application/json');
  }

  async getLogs(_limit?: number): Promise<LogEntry[]> { return []; }

  async healthCheck(): Promise<boolean> {
    try {
      const testKey = 'healthcheck/test';
      await this.uploadToMinio(testKey, new TextEncoder().encode('test'));
      await this.deleteObject(testKey);
      return true;
    } catch { return false; }
  }

  async getStorageStats(): Promise<{ bucketName: string; endpoint: string; isConnected: boolean; }> {
    return { bucketName: this.bucketName, endpoint: this.config.endpoint || '', isConnected: await this.healthCheck() };
  }
}