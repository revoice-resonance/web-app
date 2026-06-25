/**
 * ASR 引擎与识别阶段类型。
 *
 * 供 ASREngineIndicator 等组件描述三层 fallback 链路状态：
 *   whisper (自建主路) → gemini (云端备选) → browser (本地兜底)
 */

export type ASREngine = 'whisper' | 'gemini' | 'browser';

export type ASREngineStage =
  | 'idle'
  | 'whisper-trying'
  | 'gemini-trying'
  | 'browser-trying'
  | 'success'
  | 'failed';
