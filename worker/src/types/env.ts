export interface Env {
  // Minio 对象存储配置（用于语料收集）
  MINIO_ENDPOINT?: string;
  MINIO_PORT?: string;
  MINIO_USE_SSL?: string;
  MINIO_ACCESS_KEY: string;
  MINIO_SECRET_KEY: string;
  MINIO_BUCKET_NAME: string;
  MINIO_REGION?: string;

  // CosyVoice TTS 配置
  // 注入方式：`wrangler secret put COSYVOICE_API_KEY`（生产）/ `worker/.dev.vars`（本地）
  COSYVOICE_API_KEY?: string;
  COSYVOICE_BASE_URL?: string;   // 可选覆盖
  COSYVOICE_DEFAULT_MODEL?: string;
  COSYVOICE_DEFAULT_VOICE?: string;

  // Whisper ASR 配置
  WHISPER_API_KEY?: string;
  WHISPER_BASE_URL?: string;   // 可选覆盖
  WHISPER_ASR_DEFAULT_MODEL?: string;

  // ── Storage backend selection ──────────────────────────────────────
  // STORAGE_BACKEND: 'pg' (Hyperdrive/PostgreSQL) or 'd1' (SQLite via D1).
  // Defaults to 'd1' when unset.
  STORAGE_BACKEND?: 'pg' | 'd1';

  // PostgreSQL Hyperdrive 绑定（仅 STORAGE_BACKEND = 'pg' 时需要）
  RESONANCE_DB?: Hyperdrive;

  // D1Database 绑定（仅 STORAGE_BACKEND = 'd1' 时需要）
  RESONANCE_D1?: D1Database;

  // KVNamespace 绑定（D1 速率限制使用，可选）
  RESONANCE_KV?: KVNamespace;

  // JWT 签名密钥（HS256），通过 `wrangler secret put JWT_SECRET` 注入
  JWT_SECRET?: string;

  // 阿里云 SMS 配置
  ALIBABA_ACCESS_KEY_ID?: string;
  ALIBABA_ACCESS_KEY_SECRET?: string;
  ALIBABA_SMS_SIGN_NAME?: string;
  ALIBABA_SMS_TEMPLATE_CODE?: string;

  // 静态资源
  ASSETS: Fetcher;

  // 安全配置（可选）
  // ALLOWED_ORIGIN: 限制 CORS 允许的来源（如 https://app.example.com）；未设置时回显请求 Origin
  ALLOWED_ORIGIN?: string;
  // API_KEY: 写接口共享密钥；未设置时不鉴权（仅限本地开发），生产部署应配置并通过 X-API-Key 头访问
  API_KEY?: string;
}