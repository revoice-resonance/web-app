import { TTSService, TTSRequest, TTSJob } from '../types';
import { JobService } from './JobService';
import { StorageManager } from '../storage/StorageManager';

/**
 * TTS 语音合成服务
 * 基于S3标识符的异步任务模式
 */
export class TTSServiceImpl implements TTSService {
  private jobService: JobService;
  private storageManager: StorageManager;

  constructor(private env: any) {
    this.jobService = new JobService(env);
    this.storageManager = new StorageManager(env);
  }

  async submitSynthesisJob(request: TTSRequest): Promise<TTSJob> {
    // 验证输入文本
    if (!request.text || request.text.trim().length === 0) {
      throw new Error('合成文本不能为空');
    }

    if (request.text.length > 1000) {
      throw new Error('合成文本过长（最多1000字符）');
    }

    // 创建TTS任务
    const job = await this.jobService.createTTSJob(request);

    return job;
  }

  async submitVoiceCloneJob(referenceAudioKey: string, text: string): Promise<TTSJob> {
    // 验证参考音频文件是否存在
    const audioExists = await this.storageManager.getAudio(referenceAudioKey);
    if (!audioExists) {
      throw new Error('参考音频文件不存在');
    }

    if (!text || text.trim().length === 0) {
      throw new Error('合成文本不能为空');
    }

    // 创建语音克隆任务
    const request = { text, voice: 'cloned' };
    const job = await this.jobService.createTTSJob(request, true);

    // 保存参考音频标识符到任务元数据
    await this.jobService.updateTTSJob(job.jobId, {
      request: { ...request, referenceAudioKey } as any
    });

    return job;
  }

  async getJobStatus(jobId: string): Promise<TTSJob> {
    const job = await this.jobService.getTTSJob(jobId);
    if (!job) {
      throw new Error(`TTS任务不存在: ${jobId}`);
    }
    return job;
  }

  async getSynthesizedAudio(audioKey: string): Promise<ArrayBuffer> {
    const audio = await this.storageManager.getAudio(audioKey);
    if (!audio) {
      throw new Error('合成音频不存在');
    }
    return audio;
  }

  // 健康检查
  async healthCheck(): Promise<boolean> {
    return false;
  }

  // 获取可用语音列表
  async getAvailableVoices(): Promise<string[]> {
    return ['default'];
  }
}