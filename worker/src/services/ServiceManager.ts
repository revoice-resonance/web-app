import { ASRService, TTSService, LoggingService, StorageService, CorpusService } from '../types';
import { ASRServiceImpl } from './ASRService';
import { TTSServiceImpl } from './TTSService';
import { LoggingServiceImpl } from './LoggingService';
import { StorageManager } from '../storage/StorageManager';
import { CorpusServiceImpl } from './CorpusService';
import { Env } from '../types/env';

interface ServiceManagerEnv extends Env {
  MINIO_ENDPOINT?: string;
  MINIO_PORT?: string;
  MINIO_USE_SSL?: string;
  MINIO_REGION?: string;
}

/**
 * 业务服务管理器
 * 统一管理所有业务服务实例
 */
export class ServiceManager {
  private asrService: ASRService;
  private ttsService: TTSService;
  private loggingService: LoggingService;
  private corpusService: CorpusService;
  private storageManager: StorageManager;

  constructor(private env: ServiceManagerEnv) {
    // 初始化存储管理器
    this.storageManager = new StorageManager(env);

    // 初始化业务服务
    this.asrService = new ASRServiceImpl(env);
    this.ttsService = new TTSServiceImpl(env);
    this.loggingService = new LoggingServiceImpl(this.storageManager);
    this.corpusService = new CorpusServiceImpl(env);
  }

  // 获取 ASR 服务
  getASRService(): ASRService {
    return this.asrService;
  }

  // 获取 TTS 服务
  getTTSService(): TTSService {
    return this.ttsService;
  }

  // 获取日志服务
  getLoggingService(): LoggingService {
    return this.loggingService;
  }

  // 获取语料服务
  getCorpusService(): CorpusService {
    return this.corpusService;
  }

  // 获取存储管理器
  getStorageManager(): StorageManager {
    return this.storageManager;
  }

  // 健康检查
  async healthCheck(): Promise<{
    asr: { whisper: boolean; gemini: boolean };
    tts: boolean;
    corpus: boolean;
    storage: string;
    timestamp: string;
  }> {
    return {
      // Legacy VPC/Gemini services removed; Whisper ASR + CosyVoice TTS via cloud API
      asr: { whisper: !!this.env.WHISPER_API_KEY, gemini: false },
      tts: !!this.env.COSYVOICE_API_KEY,
      corpus: !!(this.env.MINIO_ENDPOINT && this.env.MINIO_ACCESS_KEY && this.env.MINIO_SECRET_KEY && this.env.MINIO_BUCKET_NAME),
      storage: 'minio',
      timestamp: new Date().toISOString(),
    };
  }

  // 服务统计信息
  async getServiceStats(): Promise<{
    storageType: string;
    asrEngines: string[];
    ttsAvailable: boolean;
    corpusAvailable: boolean;
    logStats: any;
  }> {
    const asrEngines = [];
    if (this.env.WHISPER_API_KEY) asrEngines.push('whisper');

    const logStats = { total: 0, byLevel: { info: 0, warn: 0, error: 0 }, recentErrors: 0 };

    return {
      storageType: this.storageManager.getStorageType(),
      asrEngines,
      ttsAvailable: !!this.env.COSYVOICE_API_KEY,
      corpusAvailable: !!(this.env.MINIO_ENDPOINT && this.env.MINIO_ACCESS_KEY && this.env.MINIO_SECRET_KEY && this.env.MINIO_BUCKET_NAME),
      logStats,
    };
  }

  // 清理资源（如果需要）
  async cleanup(): Promise<void> {
    // 目前不需要特殊的清理逻辑
    // 如果需要，可以在这里添加资源释放代码
  }
}