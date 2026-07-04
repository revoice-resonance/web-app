import { ASRService, TranscriptionResult, ASRJob } from '../types';
import { validateAudioFormat, calculateAudioDuration } from '../utils';
import { JobService } from './JobService';
import { StorageManager } from '../storage/StorageManager';

/**
 * ASR 语音识别服务
 * 基于S3标识符的异步任务模式
 */
export class ASRServiceImpl implements ASRService {
  private jobService: JobService;
  private storageManager: StorageManager;

  constructor(private env: any) {
    this.jobService = new JobService(env);
    this.storageManager = new StorageManager(env);
  }

  async submitTranscriptionJob(
    audioKey: string, 
    options: { language?: string; prefer?: 'whisper' | 'gemini' | 'browser' } = {}
  ): Promise<ASRJob> {
    // 验证音频文件是否存在
    const audioExists = await this.storageManager.getAudio(audioKey);
    if (!audioExists) {
      throw new Error('音频文件不存在');
    }

    // 创建ASR任务
    const job = await this.jobService.createASRJob(audioKey, options);
    
    // 这里应该触发GPU机器处理任务
    // 简化实现：直接模拟处理
    setTimeout(() => {
      this.processASRJob(job.jobId).catch(console.error);
    }, 100);

    return job;
  }

  async getJobStatus(jobId: string): Promise<ASRJob> {
    const job = await this.jobService.getASRJob(jobId);
    if (!job) {
      throw new Error(`ASR任务不存在: ${jobId}`);
    }
    return job;
  }

  async getTranscriptionResult(resultKey: string): Promise<TranscriptionResult> {
    const result = await this.storageManager.getTranscription(resultKey);
    if (!result) {
      throw new Error('转录结果不存在');
    }
    return result;
  }

  /**
   * 处理ASR任务（GPU机器调用）
   */
  private async processASRJob(jobId: string): Promise<void> {
    try {
      const job = await this.jobService.getASRJob(jobId);
      if (!job) return;

      // 更新任务状态为处理中
      await this.jobService.updateASRJob(jobId, { status: 'processing' });

      // 从S3获取音频数据
      const audio = await this.storageManager.getAudio(job.audioKey);
      if (!audio) {
        throw new Error('音频文件获取失败');
      }

      // 执行语音识别（这里应该调用GPU机器）
      const result = await this.performTranscription(audio);
      
      // 保存转录结果到S3（使用 saveTranscription 实际返回的 key，避免与下游 getTranscription 不一致）
      const { key: resultKey } = await this.storageManager.saveTranscription(
        `transcriptions/${jobId}`,
        result,
      );

      // 更新任务状态为完成
      await this.jobService.updateASRJob(jobId, {
        status: 'completed',
        resultKey,
      });

    } catch (error) {
      // 更新任务状态为失败
      await this.jobService.updateASRJob(jobId, { 
        status: 'failed', 
        error: error instanceof Error ? error.message : '未知错误'
      });
    }
  }

  /**
   * 执行语音识别（GPU机器实现）
   */
  private async performTranscription(audio: ArrayBuffer): Promise<TranscriptionResult> {
    // 这里应该是GPU机器的实现
    // 简化实现：返回模拟结果
    return {
      text: '这是模拟的转录文本',
      confidence: 0.95,
      language: 'zh-CN',
      duration: calculateAudioDuration(audio),
      source: 'whisper' as const,
    };
  }

  // 健康检查
  async healthCheck(): Promise<{ whisper: boolean; gemini: boolean }> {
    return { whisper: false, gemini: false };
  }
}