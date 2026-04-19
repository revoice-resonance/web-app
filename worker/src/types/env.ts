import { ServiceManager } from './services/ServiceManager';
import { createCorsResponse, createSuccessResponse, createErrorResponse, generateId } from './utils';

export interface Env {
  // VPC 绑定
  WHISPER_VPC?: Fetcher;
  COSYVOICE_VPC?: Fetcher;

  // Gemini ASR 配置
  GEMINI_ASR_URL?: string;
  GEMINI_ASR_KEY?: string;

  // Minio 对象存储配置（用于语料收集）
  MINIO_ENDPOINT?: string;
  MINIO_PORT?: string;
  MINIO_USE_SSL?: string;
  MINIO_ACCESS_KEY: string;
  MINIO_SECRET_KEY: string;
  MINIO_BUCKET_NAME: string;
  MINIO_REGION?: string;

  // 静态资源
  ASSETS: Fetcher;
}