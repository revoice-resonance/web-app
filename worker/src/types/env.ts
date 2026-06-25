import { ServiceManager } from '../services/ServiceManager';
import { createCorsResponse, createSuccessResponse, createErrorResponse, generateId } from '../utils';

export interface Env {
  // VPC 绑定
  WHISPER_VPC?: Fetcher;
  COSYVOICE_VPC?: Fetcher;

  // Gemini ASR 配置
  GEMINI_ASR_URL?: string;
  GEMINI_ASR_KEY?: string;

  // Minio 对象存储配置（用于语料收集）
  MINIO_ENDPOINT?: string;
  MINIO_VPC?: Fetcher;
  MINIO_PORT?: string;
  MINIO_USE_SSL?: string;
  MINIO_ACCESS_KEY: string;
  MINIO_SECRET_KEY: string;
  MINIO_BUCKET_NAME: string;
  MINIO_REGION?: string;

  // CloudSpeech TTS（云端兜底 / 独立合成通道）
  // 注入方式：`wrangler secret put CLOUD_SPEECH_API_KEY`（生产）/ `worker/.dev.vars`（本地）
  // 永远不要把 key 明文写进任何文件或 wrangler.jsonc
  CLOUD_SPEECH_API_KEY?: string;
  CLOUD_SPEECH_BASE_URL?: string;   // 可选覆盖，默认 https://api.cloud-speech.com/v1
  CLOUD_SPEECH_DEFAULT_MODEL?: string;  // 可选覆盖，默认 step-tts-mini
  CLOUD_SPEECH_DEFAULT_VOICE?: string;  // 可选覆盖，默认 wenrounvsheng

  // 静态资源
  ASSETS: Fetcher;

  // 安全配置（可选）
  // ALLOWED_ORIGIN: 限制 CORS 允许的来源（如 https://app.example.com）；未设置时回显请求 Origin
  ALLOWED_ORIGIN?: string;
  // API_KEY: 写接口共享密钥；未设置时不鉴权（仅限本地开发），生产部署应配置并通过 X-API-Key 头访问
  API_KEY?: string;
}