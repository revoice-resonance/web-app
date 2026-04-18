import { TTSService, TTSRequest, TTSResult, TTSJob } from '../types';
import { JobService } from './JobService';
import { StorageManager } from './StorageManager';

interface Env {
  COSYVOICE_VPC?: Fetcher;
}

/**
 * TTS 语音合成服务
 * 基于S3标识符的异步任务模式
 */
export class TTSServiceImpl implements TTSService {
  private jobService: JobService;
  private storageManager: StorageManager;

  constructor(private env: Env) {
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
    
    // 这里应该触发GPU机器处理任务
    // 简化实现：直接模拟处理
    setTimeout(() => {
      this.processTTSJob(job.jobId).catch(console.error);
    }, 100);

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
      request: { ...request, referenceAudioKey }
    });

    // 这里应该触发GPU机器处理任务
    setTimeout(() => {
      this.processVoiceCloneJob(job.jobId).catch(console.error);
    }, 100);

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

  private async tryCosyVoiceSynthesis(
    text: string, 
    voice: string, 
    speed: number, 
    pitch: number
  ): Promise<TTSResult> {
    if (!this.env.COSYVOICE_VPC) {
      throw new Error('CosyVoice 服务未配置');
    }

    const requestBody = {
      text: text.trim(),
      voice,
      speed: Math.max(0.5, Math.min(2.0, speed)),
      pitch: Math.max(0.5, Math.min(2.0, pitch)),
      format: 'wav',
      sample_rate: 24000,
    };

    const response = await this.env.COSYVOICE_VPC.fetch('http://127.0.0.1/v1/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`CosyVoice 合成错误: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    
    if (audioBuffer.byteLength === 0) {
      throw new Error('合成结果为空');
    }

    // 估算音频时长（假设24kHz采样率）
    const duration = this.estimateAudioDuration(audioBuffer);

    return {
      audio: audioBuffer,
      format: 'wav',
      duration,
    };
  }

  private async tryCosyVoiceCloning(referenceAudio: ArrayBuffer, text: string): Promise<TTSResult> {
    if (!this.env.COSYVOICE_VPC) {
      throw new Error('CosyVoice 服务未配置');
    }

    const formData = new FormData();
    const audioBlob = new Blob([referenceAudio], { type: 'audio/wav' });
    
    formData.append('prompt_wav', audioBlob, 'reference.wav');
    formData.append('tts_text', text.trim());
    formData.append('prompt_text', '参考音频');

    const response = await this.env.COSYVOICE_VPC.fetch('http://127.0.0.1/inference_zero_shot', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`CosyVoice 克隆错误: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    
    if (audioBuffer.byteLength === 0) {
      throw new Error('克隆结果为空');
    }

    const duration = this.estimateAudioDuration(audioBuffer);

    return {
      audio: audioBuffer,
      format: 'wav',
      duration,
    };
  }

  private estimateAudioDuration(audio: ArrayBuffer, sampleRate = 24000): number {
    // 简单的音频时长估算
    // WAV文件：44字节头 + PCM数据
    const dataSize = audio.byteLength - 44; // 减去WAV头
    const bytesPerSample = 2; // 16位PCM
    const numSamples = dataSize / bytesPerSample;
    
    return Math.max(0, numSamples / sampleRate);
  }

  // 健康检查
  async healthCheck(): Promise<boolean> {
    if (!this.env.COSYVOICE_VPC) {
      return false;
    }

    try {
      const response = await this.env.COSYVOICE_VPC.fetch('http://127.0.0.1/health');
      return response.ok;
    } catch {
      return false;
    }
  }

  // 获取可用语音列表
  async getAvailableVoices(): Promise<string[]> {
    if (!this.env.COSYVOICE_VPC) {
      return ['default'];
    }

    try {
      const response = await this.env.COSYVOICE_VPC.fetch('http://127.0.0.1/v1/voices');
      if (response.ok) {
        const data = await response.json();
        return data.voices || ['default'];
      }
    } catch (error) {
      console.warn('Failed to get voice list:', error);
    }

    return ['default'];
  }
}