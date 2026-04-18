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
  metadata?: Record<string, any>;
}

// 存储层接口 - 基于S3的对象存储
export interface StorageService {
  // 音频文件管理
  saveAudio(key: string, audio: ArrayBuffer, metadata?: Record<string, any>): Promise<{ url: string; key: string }>;
  getAudio(key: string): Promise<ArrayBuffer | null>;
  getAudioUrl(key: string, expiresIn?: number): Promise<string>;
  deleteAudio(key: string): Promise<void>;
  
  // 转录结果管理
  saveTranscription(key: string, result: TranscriptionResult): Promise<{ url: string; key: string }>;
  getTranscription(key: string): Promise<TranscriptionResult | null>;
  getTranscriptionUrl(key: string, expiresIn?: number): Promise<string>;
  
  // 日志管理
  saveLogs(logs: LogEntry[]): Promise<void>;
  getLogs(limit?: number): Promise<LogEntry[]>;
  
  // 通用对象管理
  putObject(key: string, data: ArrayBuffer | string, contentType?: string): Promise<{ url: string; key: string }>;
  getObject(key: string): Promise<ArrayBuffer | null>;
  getObjectUrl(key: string, expiresIn?: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
  
  // 元数据管理
  getObjectMetadata(key: string): Promise<Record<string, any> | null>;
  listObjects(prefix?: string, limit?: number): Promise<{ key: string; size: number; lastModified: string }[]>;
}

// 业务服务接口
export interface ASRJob {
  jobId: string;
  audioKey: string;           // S3音频文件标识符
  status: 'pending' | 'processing' | 'completed' | 'failed';
  resultKey?: string;         // S3转录结果标识符（完成时）
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ASRService {
  // 提交语音识别任务
  submitTranscriptionJob(audioKey: string, options?: {
    language?: string;
    prefer?: 'whisper' | 'gemini' | 'browser';
  }): Promise<ASRJob>;
  
  // 查询任务状态
  getJobStatus(jobId: string): Promise<ASRJob>;
  
  // 获取转录结果（通过S3标识符）
  getTranscriptionResult(resultKey: string): Promise<TranscriptionResult>;
}

export interface TTSJob {
  jobId: string;
  request: TTSRequest;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  audioKey?: string;          // S3合成音频标识符（完成时）
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TTSService {
  // 提交语音合成任务
  submitSynthesisJob(request: TTSRequest): Promise<TTSJob>;
  
  // 提交语音克隆任务
  submitVoiceCloneJob(referenceAudioKey: string, text: string): Promise<TTSJob>;
  
  // 查询任务状态
  getJobStatus(jobId: string): Promise<TTSJob>;
  
  // 获取合成音频（通过S3标识符）
  getSynthesizedAudio(audioKey: string): Promise<ArrayBuffer>;
}

export interface LoggingService {
  info(message: string, metadata?: Record<string, any>): Promise<void>;
  warn(message: string, metadata?: Record<string, any>): Promise<void>;
  error(message: string, metadata?: Record<string, any>): Promise<void>;
  getRecentLogs(limit?: number): Promise<LogEntry[]>;
  saveClientLogs(logs: LogEntry[]): Promise<void>;
  queryLogs(startTime?: string, endTime?: string, level?: string): Promise<LogEntry[]>;
}

export interface CorpusQuery {
  corpusId?: string;
  speakerId?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
}

export interface CorpusStats {
  totalCorpus: number;
  totalAudioSize: number;
  uniqueSpeakers: number;
  lastUpload: string | null;
}

export interface CorpusService {
  upload(data: CorpusData): Promise<{ corpusId: string }>;
  validate(data: CorpusData): Promise<boolean>;
  query(query: CorpusQuery): Promise<CorpusData[]>;
  getStats(): Promise<CorpusStats>;
}