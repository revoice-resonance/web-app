import { ASRService, TranscriptionResult } from '../types';
import { validateAudioFormat, calculateAudioDuration } from '../utils';

interface Env {
  WHISPER_VPC?: Fetcher;
  GEMINI_ASR_URL?: string;
  GEMINI_ASR_KEY?: string;
}

/**
 * ASR 语音识别服务
 * 基于S3标识符的异步任务模式
 */
export class ASRServiceImpl implements ASRService {
  private jobService: JobService;
  private storageManager: StorageManager;

  constructor(private env: Env) {
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
      
      // 保存转录结果到S3
      const resultKey = `transcriptions/${jobId}.json`;
      await this.storageManager.saveTranscription(resultKey, result);

      // 更新任务状态为完成
      await this.jobService.updateASRJob(jobId, { 
        status: 'completed', 
        resultKey 
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

  private async tryWhisper(audio: ArrayBuffer, language: string): Promise<Omit<TranscriptionResult, 'duration' | 'source'>> {
    if (!this.env.WHISPER_VPC) {
      throw new Error('Whisper 服务未配置');
    }

    const formData = new FormData();
    const blob = new Blob([audio], { type: 'audio/wav' });
    formData.append('file', blob, 'audio.wav');
    formData.append('language', language);

    const response = await this.env.WHISPER_VPC.fetch('http://127.0.0.1/v1/audio/transcriptions', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Whisper 服务错误: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.text) {
      throw new Error('Whisper 识别结果为空');
    }

    return {
      text: data.text.trim(),
      confidence: data.confidence || 0.8,
      language: data.language || language,
    };
  }

  private async tryGemini(audio: ArrayBuffer, language: string, duration: number): Promise<TranscriptionResult> {
    if (!this.env.GEMINI_ASR_URL) {
      throw new Error('Gemini ASR 服务未配置');
    }

    const formData = new FormData();
    const blob = new Blob([audio], { type: 'audio/wav' });
    formData.append('file', blob, 'audio.wav');

    const headers: Record<string, string> = {};
    if (this.env.GEMINI_ASR_KEY) {
      headers['Authorization'] = `Bearer ${this.env.GEMINI_ASR_KEY}`;
    }

    const response = await fetch(this.env.GEMINI_ASR_URL, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Gemini ASR 服务错误: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.text) {
      throw new Error('Gemini 识别结果为空');
    }

    return {
      text: data.text.trim(),
      confidence: data.confidence || 0.7,
      language: data.language || language,
      duration,
      source: 'gemini',
    };
  }

  private async fallbackToGemini(audio: ArrayBuffer, language: string, duration: number): Promise<TranscriptionResult> {
    try {
      return await this.tryGemini(audio, language, duration);
    } catch (error) {
      console.warn('Gemini fallback also failed:', error);
      
      // 最终返回空结果而不是抛出错误
      return {
        text: '',
        confidence: 0,
        language,
        duration,
        source: 'gemini',
      };
    }
  }

  // 健康检查
  async healthCheck(): Promise<{ whisper: boolean; gemini: boolean }> {
    const results = {
      whisper: false,
      gemini: false,
    };

    // 检查 Whisper
    if (this.env.WHISPER_VPC) {
      try {
        const response = await this.env.WHISPER_VPC.fetch('http://127.0.0.1/health');
        results.whisper = response.ok;
      } catch {
        results.whisper = false;
      }
    }

    // 检查 Gemini
    if (this.env.GEMINI_ASR_URL) {
      try {
        const response = await fetch(this.env.GEMINI_ASR_URL, { 
          method: 'HEAD',
          timeout: 5000 
        });
        results.gemini = response.ok;
      } catch {
        results.gemini = false;
      }
    }

    return results;
  }
}