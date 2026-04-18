import { useState } from 'react';
import { AlertCircle, RefreshCw, Wifi, WifiOff, Info, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ASRError } from '@/types/asrError';

interface Props {
  error: ASRError;
  onRetry?: () => void;
  onDismiss?: () => void;
}

const ICONS: Partial<Record<ASRError['code'], typeof AlertCircle>> = {
  NETWORK_OFFLINE: WifiOff,
  NETWORK_TIMEOUT: Wifi,
  FALLBACK_ACTIVE: Info,
};

/**
 * 无障碍错误横幅（决策1双通道的用户侧实现）
 *
 * 无障碍保障（WCAG 2.1）：
 * - 1.4.3 对比度：用 destructive / amber 语义色 + border-2
 * - 2.1.1 键盘可达：Button 原生 focus，details/summary 可 Tab 到
 * - 2.4.7 焦点可见：focus-visible:ring-2
 * - 3.3.3 建议性错误：userAction 给具体操作建议
 * - 4.1.3 状态消息：role=alert/status + aria-live + aria-atomic
 *
 * 字体缩放：使用 rem/text-* 响应项目 --font-scale
 * 大触控目标：Button size=lg 响应 .large-targets class
 */
export function ASRErrorBanner({ error, onRetry, onDismiss }: Props) {
  const Icon = ICONS[error.code] ?? AlertCircle;
  const isFallback =
    error.code === 'FALLBACK_ACTIVE' || error.fallbackActive;

  // 降级是告知性消息，不打断屏幕阅读器；真错误是 alert
  const role = isFallback ? 'status' : 'alert';
  const ariaLive = isFallback ? 'polite' : 'assertive';

  const [copied, setCopied] = useState(false);
  const diagnosticsText = `[${error.code}] status=${error.diagnostics.status ?? 'n/a'} attempts=${error.diagnostics.attempts} duration=${error.diagnostics.totalDurationMs}ms${error.diagnostics.requestId ? ` req=${error.diagnostics.requestId}` : ''} at=${error.diagnostics.timestamp}`;

  const handleCopyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticsText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop — 复制失败静默 */
    }
  };

  return (
    <div
      role={role}
      aria-live={ariaLive}
      aria-atomic="true"
      className={`a11y-target flex flex-col gap-3 rounded-xl border-2 p-4 sm:flex-row sm:items-start ${
        isFallback
          ? 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-100'
          : 'border-destructive bg-destructive/10 text-destructive'
      }`}
    >
      <Icon
        className="mt-0.5 h-6 w-6 shrink-0"
        aria-hidden="true"
      />

      <div className="flex-1 space-y-1">
        <p className="text-base font-semibold leading-tight">
          {error.userMessage}
        </p>
        {error.userAction && (
          <p className="text-sm opacity-90">{error.userAction}</p>
        )}

        {/* 透明信息 — 默认折叠不吓人，展开后一键复制给客服 */}
        <details className="mt-1 text-xs opacity-70">
          <summary className="cursor-pointer rounded py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2">
            反馈给客服时可展开这段
          </summary>
          <div className="mt-1 flex items-start gap-2">
            <code
              className="flex-1 block break-all rounded bg-background/40 p-2 font-mono text-xs leading-relaxed"
              aria-label="诊断信息详情"
            >
              {diagnosticsText}
            </code>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCopyDiagnostics}
              className="a11y-target shrink-0 gap-1 h-auto py-1 px-2 text-xs"
              aria-label={copied ? '已复制诊断信息' : '复制诊断信息'}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  复制
                </>
              )}
            </Button>
          </div>
        </details>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        {error.retryable && onRetry && (
          <Button
            size="lg"
            variant={isFallback ? 'outline' : 'default'}
            onClick={onRetry}
            className="a11y-target gap-2"
            aria-label="重新识别"
          >
            <RefreshCw className="h-5 w-5" aria-hidden="true" />
            重试
          </Button>
        )}
        {onDismiss && (
          <Button
            size="lg"
            variant="ghost"
            onClick={onDismiss}
            className="a11y-target"
            aria-label="关闭提示"
          >
            关闭
          </Button>
        )}
      </div>
    </div>
  );
}
