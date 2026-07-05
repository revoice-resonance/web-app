/**
 * ASR 错误双通道类型：用户消息 + 运维诊断
 * 设计原则（决策1）：
 * - 用户侧：按 errorCode 给具体消息 + 可操作建议 + 无障碍横幅
 * - 运维侧：保留 status / attempts / duration / requestId 完整上下文
 */

export type ASRErrorCode =
  | 'NETWORK_OFFLINE'
  | 'NETWORK_TIMEOUT'
  | 'SERVER_BUSY'
  | 'SERVER_ERROR'
  | 'AUTH_ERROR'
  | 'QUOTA_EXCEEDED'
  | 'BAD_REQUEST'
  | 'FALLBACK_ACTIVE'
  | 'ALL_FAILED';

export interface ASRErrorDiagnostics {
  status: number | null;
  statusText?: string;
  attempts: number;
  totalDurationMs: number;
  requestId?: string | null;
  originalError?: string;
  retryAfterMs?: number | null;
  timestamp: string;
  /** Upstream model ID (e.g. "stepaudio-2.5-asr"). */
  model?: string;
  /** Server-side processing time reported by the upstream API (ms). */
  serverElapsedMs?: number;
  /** Audio MIME type sent to the API (e.g. "audio/webm;codecs=opus"). */
  mimeType?: string;
}

export interface ASRError {
  code: ASRErrorCode;
  /** 给用户看的短消息（≤15 字，屏幕阅读器友好） */
  userMessage: string;
  /** 给用户的可操作建议 */
  userAction?: string;
  /** 是否可重试（决定是否显示重试按钮） */
  retryable: boolean;
  /** 是否已自动降级到浏览器内置识别 */
  fallbackActive: boolean;
  /** 运维侧完整上下文（不展示给用户） */
  diagnostics: ASRErrorDiagnostics;
}

const MESSAGES: Record<
  ASRErrorCode,
  { msg: string; action?: string; retry: boolean }
> = {
  NETWORK_OFFLINE: {
    msg: '当前无网络连接',
    action: '请检查 Wi-Fi 或移动数据后重试',
    retry: true,
  },
  NETWORK_TIMEOUT: {
    msg: '服务响应较慢',
    action: '请点击重试',
    retry: true,
  },
  SERVER_BUSY: {
    msg: '识别服务忙碌中',
    action: '已切换备用识别',
    retry: true,
  },
  SERVER_ERROR: {
    msg: '识别服务暂时不可用',
    action: '已切换备用识别',
    retry: true,
  },
  AUTH_ERROR: {
    msg: '登录已过期',
    action: '请重新登录',
    retry: false,
  },
  QUOTA_EXCEEDED: {
    msg: '录音时间过长',
    action: '建议录音不超过 60 秒',
    retry: false,
  },
  BAD_REQUEST: {
    msg: '录音格式不支持',
    action: '请重新录音',
    retry: true,
  },
  FALLBACK_ACTIVE: {
    msg: '正在使用备用识别',
    action: '浏览器识别精度可能略低',
    retry: false,
  },
  ALL_FAILED: {
    msg: '识别暂不可用',
    action: '请稍后重试或联系管理员',
    retry: true,
  },
};

export function buildASRError(
  code: ASRErrorCode,
  diagnostics: ASRErrorDiagnostics,
  fallbackActive = false,
): ASRError {
  const m = MESSAGES[code];
  return {
    code,
    userMessage: m.msg,
    userAction: m.action,
    retryable: m.retry,
    fallbackActive,
    diagnostics,
  };
}

/** 从 HTTP status 映射到 errorCode */
export function statusToErrorCode(status: number | null): ASRErrorCode {
  if (status === null) return 'NETWORK_TIMEOUT';
  if (status === 401 || status === 403) return 'AUTH_ERROR';
  if (status === 413) return 'QUOTA_EXCEEDED';
  if (status === 400) return 'BAD_REQUEST';
  if (status === 429 || status === 503) return 'SERVER_BUSY';
  if (status >= 500) return 'SERVER_ERROR';
  return 'ALL_FAILED';
}

/**
 * 运维埋点钩子：未来挂 Sentry / 自建平台时只需注册
 * window.__ASR_TELEMETRY__ = (err) => sentry.captureException(err.diagnostics)
 */
declare global {
  interface Window {
    __ASR_TELEMETRY__?: (error: ASRError) => void;
  }
}

export function emitTelemetry(error: ASRError) {
  try {
    if (typeof window !== 'undefined' && window.__ASR_TELEMETRY__) {
      window.__ASR_TELEMETRY__(error);
    }
  } catch {
    /* telemetry failure must not break UX */
  }
  // 发布前用 console 兜底，用户截图即可附带
  // eslint-disable-next-line no-console
  console.warn('[ASR]', error.code, error.diagnostics);
}
