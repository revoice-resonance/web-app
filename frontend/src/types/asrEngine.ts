/**
 * ASR 引擎与识别阶段类型。
 *
 * 供 ASREngineIndicator 等组件描述双层 fallback 链路状态：
 *   cloud (云端主路) → browser (浏览器本地兜底)
 */

export type ASREngine = 'cloud' | 'browser';

export type ASREngineStage =
  | 'idle'
  | 'cloud-trying'
  | 'browser-trying'
  | 'success'
  | 'failed';
