export interface Env {
  // Minio 对象存储配置（用于语料收集）
  MINIO_ENDPOINT?: string;
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

  // CloudSpeech ASR（语音识别）
  CLOUD_SPEECH_ASR_DEFAULT_MODEL?: string;  // 可选覆盖，默认 stepaudio-2.5-asr

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
