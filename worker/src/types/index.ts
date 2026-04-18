// 通用类型定义
export interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AudioMetadata {
  duration: number;
  sampleRate: number;
  format: string;
  size: number;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language: string;
  duration: number;
  source: 'whisper' | 'gemini' | 'browser';
}

export interface TTSRequest {
  text: string;
  voice?: string;
  speed?: number;
  pitch?: number;
}

export interface TTSResult {
  audio: ArrayBuffer;
  format: string;
  duration: number;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, any>;
}

export interface CorpusData {
  audio: ArrayBuffer;
  transcript: string;
  speakerId?: string;
  userId?: string;           // 用户ID，用于用户系统对接
  sessionId?: string;        // 会话ID，用于跟踪会话
  metadata?: Record<string, any>;
}

// 存储层接口
export interface StorageService {
  saveAudio(key: string, audio: ArrayBuffer): Promise<void>;
  getAudio(key: string): Promise<ArrayBuffer | null>;
  deleteAudio(key: string): Promise<void>;
  
  saveTranscription(key: string, result: TranscriptionResult): Promise<void>;
  getTranscription(key: string): Promise<TranscriptionResult | null>;
  
  saveLogs(logs: LogEntry[]): Promise<void>;
  getLogs(limit?: number): Promise<LogEntry[]>;
}

// 业务服务接口
export interface ASRService {
  transcribe(audio: ArrayBuffer, options?: {
    language?: string;
    prefer?: 'whisper' | 'gemini' | 'browser';
  }): Promise<TranscriptionResult>;
}

export interface TTSService {
  synthesize(request: TTSRequest): Promise<TTSResult>;
  cloneVoice(referenceAudio: ArrayBuffer, text: string): Promise<TTSResult>;
}

export interface LoggingService {
  info(message: string, metadata?: Record<string, any>): Promise<void>;
  warn(message: string, metadata?: Record<string, any>): Promise<void>;
  error(message: string, metadata?: Record<string, any>): Promise<void>;
  getRecentLogs(limit?: number): Promise<LogEntry[]>;
}

export interface CorpusService {
  upload(data: CorpusData): Promise<void>;
  validate(data: CorpusData): Promise<boolean>;
}