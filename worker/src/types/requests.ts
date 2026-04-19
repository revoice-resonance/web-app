// Request/Response 类型定义
export interface ASRJobSubmitRequest {
  audioKey: string;
  language?: string;
  prefer?: 'whisper' | 'gemini' | 'browser';
}

export interface ASRJobStatusRequest {
  jobId: string;
}

export interface TTSJobSubmitRequest {
  text: string;
  voice?: string;
  speed?: number;
  pitch?: number;
}

export interface TTSVoiceCloneRequest {
  referenceAudioKey: string;
  text: string;
}

export interface TTSJobStatusRequest {
  jobId: string;
}

export interface AudioUploadRequest {
  file: File;
}

export interface CorpusUploadRequest {
  audio: File;
  transcript: string;
  speakerId?: string;
  metadata?: Record<string, any>;
}

export interface CorpusBatchUploadRequest {
  corpusData: CorpusUploadRequest[];
}

export interface CorpusQueryRequest {
  corpusId?: string;
  speakerId?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
}

export interface LogsUploadRequest {
  logs: LogEntry[];
}

export interface LogsQueryRequest {
  startTime?: string;
  endTime?: string;
  level?: 'info' | 'warn' | 'error';
  limit?: number;
}

// Import LogEntry from main types
import { LogEntry } from './index';