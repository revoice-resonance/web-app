import { useEffect, useState } from 'react';
import { Download, Trash2, Upload, FileText } from 'lucide-react';
import { toast } from 'sonner';
import {
  getLogEntries,
  clearLogEntries,
  formatLogsAsText,
  type LogEntry,
} from '@/lib/logRecorder';
import { CORPUS_OPTOUT_KEY } from '@/hooks/useCorpusCollection';

/**
 * Privacy + diagnostics panel rendered in Settings.
 *
 * - Lets the user opt out of automatic speech corpus collection.
 * - Lets the user download / upload recent client-side logs to support.
 *
 * Log upload posts to the Cloudflare Worker `/api/client-logs` endpoint
 * (best-effort — falls back to download if the endpoint is unavailable).
 */
export default function DiagnosticsPanel() {
  const [optOut, setOptOut] = useState<boolean>(false);
  const [count, setCount] = useState(0);
  const [recent, setRecent] = useState<LogEntry[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    try {
      setOptOut(localStorage.getItem(CORPUS_OPTOUT_KEY) === '1');
    } catch { /* ignore */ }
    refreshLogs();
  }, []);

  const refreshLogs = () => {
    const all = getLogEntries();
    setCount(all.length);
    setRecent(all.slice(-5));
  };

  const handleToggleOptOut = (checked: boolean) => {
    setOptOut(checked);
    try {
      if (checked) localStorage.setItem(CORPUS_OPTOUT_KEY, '1');
      else localStorage.removeItem(CORPUS_OPTOUT_KEY);
    } catch { /* ignore */ }
    toast.success(checked ? '已停止上传语料' : '已恢复语料上传');
  };

  const handleDownload = () => {
    const text = formatLogsAsText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resonance-logs-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('日志已下载');
  };

  const handleUpload = async () => {
    setUploading(true);
    try {
      const endpoint = `${import.meta.env.VITE_WORKER_API_URL || ''}/api/client-logs`;
      const payload = {
        ua: navigator.userAgent,
        url: location.href,
        ts: new Date().toISOString(),
        entries: getLogEntries(),
      };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      toast.success(`已上传日志 ${data?.id ? `(#${data.id})` : ''}`);
    } catch (err) {
      console.warn('[Diagnostics] Upload failed, offering download fallback', err);
      toast.error('上传失败，已为您下载本地副本');
      handleDownload();
    } finally {
      setUploading(false);
    }
  };

  const handleClear = () => {
    clearLogEntries();
    refreshLogs();
    toast.info('已清空本地日志缓存');
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h3 className="font-semibold text-foreground">隐私与诊断</h3>

      {/* Corpus opt-out */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={optOut}
          onChange={(e) => handleToggleOptOut(e.target.checked)}
          className="mt-1 h-5 w-5 rounded border-input accent-primary cursor-pointer"
          aria-describedby="optout-desc"
        />
        <div className="flex-1">
          <div className="text-sm font-medium text-foreground">不上传我的语料</div>
          <div id="optout-desc" className="text-xs text-muted-foreground mt-0.5">
            勾选后，识别成功的录音和文本将<strong>不再</strong>自动上传用于改进识别模型。
            您仍可正常使用全部识别功能。
          </div>
        </div>
      </label>

      {/* Logs */}
      <div className="border-t border-border pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <FileText className="h-4 w-4" aria-hidden="true" />
              诊断日志
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              已记录 {count} 条本地日志（仅保留最近 500 条）
            </div>
          </div>
          <button
            type="button"
            onClick={refreshLogs}
            className="text-xs text-primary hover:underline a11y-target"
          >
            刷新
          </button>
        </div>

        {recent.length > 0 && (
          <pre className="rounded-lg bg-muted/50 p-2 text-[10px] leading-relaxed text-muted-foreground max-h-24 overflow-auto">
            {recent
              .map((e) => `[${e.level}] ${e.message}`.slice(0, 140))
              .join('\n')}
          </pre>
        )}

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || count === 0}
            className="a11y-target flex items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground py-2 text-xs font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            {uploading ? '上传中...' : '上传日志'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={count === 0}
            className="a11y-target flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card py-2 text-xs font-medium text-foreground disabled:opacity-50 hover:bg-muted transition-colors"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            下载日志
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={count === 0}
            className="a11y-target flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card py-2 text-xs font-medium text-muted-foreground disabled:opacity-50 hover:bg-muted hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            清空
          </button>
        </div>
      </div>
    </div>
  );
}
