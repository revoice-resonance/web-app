import { ASRJob, TTSJob, TranscriptionResult } from '../types';
import { StorageManager } from '../storage/StorageManager';
import { generateId, getCurrentTimestamp } from '../utils';

interface Env {
  // 存储配置
  MINIO_ENDPOINT?: string;
  MINIO_ACCESS_KEY?: string;
  MINIO_SECRET_KEY?: string;
  MINIO_BUCKET_NAME?: string;
}

/**
 * 任务管理服务
 * 管理ASR和TTS的异步任务状态
 */
export class JobService {
  private storageManager: StorageManager;

  constructor(private env: Env) {
    this.storageManager = new StorageManager(env);
  }

  /**
   * 创建ASR任务
   */
  async createASRJob(audioKey: string, options?: {
    language?: string;
    prefer?: 'whisper' | 'gemini' | 'browser';
  }): Promise<ASRJob> {
    const jobId = generateId('asr-job');
    const timestamp = getCurrentTimestamp();

    const job: ASRJob = {
      jobId,
      audioKey,
      status: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    // 保存任务状态到S3
    const jobKey = `jobs/asr/${jobId}.json`;
    await this.storageManager.putObject(jobKey, JSON.stringify(job), 'application/json');

    return job;
  }

  /**
   * 更新ASR任务状态
   */
  async updateASRJob(jobId: string, updates: Partial<ASRJob>): Promise<ASRJob> {
    const jobKey = `jobs/asr/${jobId}.json`;
    const existingJob = await this.getASRJob(jobId);
    
    if (!existingJob) {
      throw new Error(`ASR任务不存在: ${jobId}`);
    }

    const updatedJob: ASRJob = {
      ...existingJob,
      ...updates,
      updatedAt: getCurrentTimestamp(),
    };

    await this.storageManager.putObject(jobKey, JSON.stringify(updatedJob), 'application/json');
    return updatedJob;
  }

  /**
   * 获取ASR任务
   */
  async getASRJob(jobId: string): Promise<ASRJob | null> {
    const jobKey = `jobs/asr/${jobId}.json`;
    const data = await this.storageManager.getObject(jobKey);

    if (!data) return null;

    try {
      const text = new TextDecoder().decode(data);
      return JSON.parse(text) as ASRJob;
    } catch (e) {
      console.error(`[Data Recovery] ASRJob 解析失败, jobId=${jobId}`);
      return null;
    }
  }

  /**
   * 创建TTS任务
   */
  async createTTSJob(request: any, isVoiceClone: boolean = false): Promise<TTSJob> {
    const jobId = generateId('tts-job');
    const timestamp = getCurrentTimestamp();

    const job: TTSJob = {
      jobId,
      request,
      status: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    // 保存任务状态到S3
    const jobKey = `jobs/tts/${jobId}.json`;
    await this.storageManager.putObject(jobKey, JSON.stringify(job), 'application/json');

    return job;
  }

  /**
   * 更新TTS任务状态
   */
  async updateTTSJob(jobId: string, updates: Partial<TTSJob>): Promise<TTSJob> {
    const jobKey = `jobs/tts/${jobId}.json`;
    const existingJob = await this.getTTSJob(jobId);
    
    if (!existingJob) {
      throw new Error(`TTS任务不存在: ${jobId}`);
    }

    const updatedJob: TTSJob = {
      ...existingJob,
      ...updates,
      updatedAt: getCurrentTimestamp(),
    };

    await this.storageManager.putObject(jobKey, JSON.stringify(updatedJob), 'application/json');
    return updatedJob;
  }

  /**
   * 获取TTS任务
   */
  async getTTSJob(jobId: string): Promise<TTSJob | null> {
    const jobKey = `jobs/tts/${jobId}.json`;
    const data = await this.storageManager.getObject(jobKey);

    if (!data) return null;

    try {
      const text = new TextDecoder().decode(data);
      return JSON.parse(text) as TTSJob;
    } catch (e) {
      console.error(`[Data Recovery] TTSJob 解析失败, jobId=${jobId}`);
      return null;
    }
  }

  /**
   * 获取待处理的任务列表
   */
  async getPendingJobs(type: 'asr' | 'tts', limit: number = 10): Promise<(ASRJob | TTSJob)[]> {
    // 简化实现，实际应该维护任务队列
    // 这里返回空数组，实际项目中应该实现任务队列机制
    return [];
  }

  /**
   * 清理过期任务
   */
  async cleanupExpiredJobs(maxAge: number = 24 * 60 * 60 * 1000): Promise<{ asr: number; tts: number }> {
    // 简化实现，实际应该定期清理过期任务
    return { asr: 0, tts: 0 };
  }

  /**
   * 获取任务统计
   */
  async getJobStats(): Promise<{
    asr: { total: number; pending: number; processing: number; completed: number; failed: number };
    tts: { total: number; pending: number; processing: number; completed: number; failed: number };
  }> {
    // 简化实现，实际应该统计任务状态
    return {
      asr: { total: 0, pending: 0, processing: 0, completed: 0, failed: 0 },
      tts: { total: 0, pending: 0, processing: 0, completed: 0, failed: 0 },
    };
  }
}