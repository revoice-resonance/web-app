import { ASRService, TTSService, LoggingService } from '../types';
import { ASRServiceImpl } from './ASRService';
import { TTSServiceImpl } from './TTSService';
import { LoggingServiceImpl } from './LoggingService';
import { StorageManager } from '../storage';

interface Env {
  WHISPER_VPC?: Fetcher;
  COSYVOICE_VPC?: Fetcher;
  GEMINI_ASR_URL?: string;
  GEMINI_ASR_KEY?: string;
  RESONANCE_KV?: KVNamespace;
}

/**
 * 业务服务管理器
 * 统一管理所有业务服务实例
 */
export class ServiceManager {
  private asrService: ASRService;
  private ttsService: TTSService;
  private loggingService: LoggingService;
  private storageManager: StorageManager;

  constructor(private env: Env) {
    // 初始化存储管理器
    this.storageManager = new StorageManager(env);
    
    // 初始化业务服务
    this.asrService = new ASRServiceImpl(env);
    this.ttsService = new TTSServiceImpl(env);
    this.loggingService = new LoggingServiceImpl(this.storageManager);
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

  // 获取存储管理器
  getStorageManager(): StorageManager {
    return this.storageManager;
  }

  // 健康检查
  async healthCheck(): Promise<{
    asr: { whisper: boolean; gemini: boolean };
    tts: boolean;
    storage: string;
    timestamp: string;
  }> {
    const [asrHealth, ttsHealth] = await Promise.all([
      this.asrService.healthCheck ? this.asrService.healthCheck() : { whisper: false, gemini: false },
      this.ttsService.healthCheck ? this.ttsService.healthCheck() : false,
    ]);

    return {
      asr: asrHealth,
      tts: ttsHealth,
      storage: this.storageManager.getStorageType(),
      timestamp: new Date().toISOString(),
    };
  }

  // 服务统计信息
  async getServiceStats(): Promise<{
    storageType: string;
    asrEngines: string[];
    ttsAvailable: boolean;
    logStats: any;
  }> {
    const asrEngines = [];
    if (this.env.WHISPER_VPC) asrEngines.push('whisper');
    if (this.env.GEMINI_ASR_URL) asrEngines.push('gemini');

    const logStats = this.loggingService.getLogStats ? 
      await this.loggingService.getLogStats() : { total: 0, byLevel: { info: 0, warn: 0, error: 0 }, recentErrors: 0 };

    return {
      storageType: this.storageManager.getStorageType(),
      asrEngines,
      ttsAvailable: !!this.env.COSYVOICE_VPC,
      logStats,
    };
  }

  // 清理资源（如果需要）
  async cleanup(): Promise<void> {
    // 目前不需要特殊的清理逻辑
    // 如果需要，可以在这里添加资源释放代码
  }
}