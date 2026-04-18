import { TTSService, TTSRequest, TTSResult } from '../types';
import { validateAudioFormat } from '../utils';

interface Env {
  COSYVOICE_VPC?: Fetcher;
}

/**
 * TTS 语音合成服务
 * 支持标准语音合成和语音克隆功能
 */
export class TTSServiceImpl implements TTSService {
  constructor(private env: Env) {}

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    const { text, voice = 'default', speed = 1.0, pitch = 1.0 } = request;

    // 验证输入文本
    if (!text || text.trim().length === 0) {
      throw new Error('合成文本不能为空');
    }

    if (text.length > 1000) {
      throw new Error('合成文本过长（最多1000字符）');
    }

    try {
      return await this.tryCosyVoiceSynthesis(text, voice, speed, pitch);
    } catch (error) {
      console.error('TTS synthesis failed:', error);
      throw new Error('语音合成服务暂时不可用');
    }
  }

  async cloneVoice(referenceAudio: ArrayBuffer, text: string): Promise<TTSResult> {
    // 验证参考音频
    if (!validateAudioFormat(referenceAudio)) {
      throw new Error('无效的参考音频格式');
    }

    // 验证文本
    if (!text || text.trim().length === 0) {
      throw new Error('克隆文本不能为空');
    }

    if (text.length > 500) {
      throw new Error('克隆文本过长（最多500字符）');
    }

    try {
      return await this.tryCosyVoiceCloning(referenceAudio, text);
    } catch (error) {
      console.error('Voice cloning failed:', error);
      throw new Error('语音克隆服务暂时不可用');
    }
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