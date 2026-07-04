/**
 * ASR 引擎与识别阶段类型。
 *
 * 供 ASREngineIndicator 等组件描述双层 fallback 链路状态：
 *   cloud-speech (阶跃星辰主路) → browser (浏览器本地兜底)
 */

export type ASREngine = 'cloud-speech' | 'browser';

export type ASREngineStage =
  | 'idle'
  | 'cloud-speech-trying'
  | 'browser-trying'
  | 'success'
  | 'failed';
