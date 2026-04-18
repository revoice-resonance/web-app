// 通用工具函数
import { ApiResponse } from '../types';

export function createSuccessResponse<T>(data?: T, message?: string): ApiResponse<T> {
  return {
    ok: true,
    data,
    message
  };
}

export function createErrorResponse(error: string, message?: string): ApiResponse {
  return {
    ok: false,
    error,
    message
  };
}

export function validateAudioFormat(audio: ArrayBuffer): boolean {
  // 简单的音频格式验证
  if (!audio || audio.byteLength === 0) return false;
  
  // 检查是否为有效的音频数据
  const view = new DataView(audio);
  
  // 检查WAV文件头（如果存在）
  if (audio.byteLength >= 12) {
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    
    if (riff === 'RIFF' && wave === 'WAVE') {
      return true;
    }
  }
  
  // 检查是否为有效的音频数据（简单的启发式检查）
  return audio.byteLength > 100; // 假设有效音频至少100字节
}

export function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function sanitizeText(text: string): string {
  return text.trim().replace(/[\x00-\x1F\x7F]/g, '').slice(0, 1000);
}

export function calculateAudioDuration(audio: ArrayBuffer, sampleRate = 24000): number {
  // 简单的音频时长估算（假设16位PCM）
  const bytesPerSample = 2; // 16位 = 2字节
  const numSamples = audio.byteLength / bytesPerSample;
  return numSamples / sampleRate;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

// CORS 头设置
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info',
};

export function createCorsResponse(body?: any, status = 200): Response {
  const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json',
  };
  
  if (body === undefined) {
    return new Response(null, { status, headers });
  }
  
  return new Response(JSON.stringify(body), { status, headers });
}