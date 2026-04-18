import { ASRService, TranscriptionResult } from '../types';
import { validateAudioFormat, calculateAudioDuration } from '../utils';

interface Env {
  WHISPER_VPC?: Fetcher;
  GEMINI_ASR_URL?: string;
  GEMINI_ASR_KEY?: string;
}

/**
 * ASR 语音识别服务
 * 实现多引擎语音识别和降级策略
 */
export class ASRServiceImpl implements ASRService {
  constructor(private env: Env) {}

  async transcribe(
    audio: ArrayBuffer, 
    options: { language?: string; prefer?: 'whisper' | 'gemini' | 'browser' } = {}
  ): Promise<TranscriptionResult> {
    const { language = 'zh-CN', prefer = 'auto' } = options;

    // 验证音频格式
    if (!validateAudioFormat(audio)) {
      throw new Error('无效的音频格式');
    }

    const duration = calculateAudioDuration(audio);

    // 根据偏好选择识别引擎
    if (prefer === 'whisper' || prefer === 'auto') {
      try {
        const result = await this.tryWhisper(audio, language);
        return {
          ...result,
          duration,
          source: 'whisper' as const,
        };
      } catch (error) {
        console.warn('Whisper recognition failed:', error);
        
        if (prefer === 'whisper') {
          throw new Error('Whisper 识别失败');
        }
        
        // 自动模式下尝试 Gemini
        return await this.fallbackToGemini(audio, language, duration);
      }
    }

    if (prefer === 'gemini') {
      return await this.tryGemini(audio, language, duration);
    }

    throw new Error('不支持的识别引擎');
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