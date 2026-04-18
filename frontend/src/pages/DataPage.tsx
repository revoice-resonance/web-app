import { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Upload, Trash2, AlertTriangle } from 'lucide-react';

interface DataPageProps {
  phraseCount: number;
  recordingCount: number;
  onExport: () => void;
  onImport: (json: string) => boolean;
  onClearTraining: () => void;
  onClearAll: () => void;
}

export default function DataPage({
  phraseCount,
  recordingCount,
  onExport,
  onImport,
  onClearTraining,
  onClearAll,
}: DataPageProps) {
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const success = onImport(reader.result as string);
      if (!success) alert('导入失败，请检查文件格式');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <section className="max-w-lg mx-auto space-y-6" aria-labelledby="data-heading">
      <div>
        <h2 id="data-heading" className="text-2xl font-bold text-foreground">数据管理</h2>
        <p className="mt-1 text-muted-foreground">导入导出和管理本地数据</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4" role="group" aria-label="数据统计">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-3xl font-bold text-primary" aria-label={`${phraseCount} 条词表条目`}>{phraseCount}</p>
          <p className="text-sm text-muted-foreground mt-1">词表条目</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-3xl font-bold text-primary" aria-label={`${recordingCount} 个录音样本`}>{recordingCount}</p>
          <p className="text-sm text-muted-foreground mt-1">录音样本</p>
        </div>
      </div>

      {/* Import/Export */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="font-semibold text-foreground">导入 / 导出</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onExport}
            className="a11y-target flex items-center justify-center gap-2 rounded-lg border border-border py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            aria-label="导出词表为JSON文件"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            导出词表
          </button>
          <label className="a11y-target flex items-center justify-center gap-2 rounded-lg border border-border py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors cursor-pointer" tabIndex={0} role="button" aria-label="导入词表JSON文件">
            <Upload className="h-4 w-4" aria-hidden="true" />
            导入词表
            <input type="file" accept=".json" onChange={handleImportFile} className="hidden" aria-hidden="true" />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          导出/导入仅包含词表和设置数据（不含录音音频）。数据以 JSON 格式存储。
        </p>
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl border border-destructive/30 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <h3 className="font-semibold text-foreground">危险操作</h3>
        </div>

        {confirmAction === 'training' ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-lg bg-destructive/10 p-4"
          >
            <p className="text-sm text-foreground mb-3">
              确定要清空所有训练数据吗？词表将保留，但所有录音将被删除。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  onClearTraining();
                  setConfirmAction(null);
                }}
                className="a11y-target rounded-lg bg-destructive px-5 py-3 text-sm font-medium text-destructive-foreground hover:opacity-90"
                aria-label="确认清空训练数据"
              >
                确认清空
              </button>
              <button
                onClick={() => setConfirmAction(null)}
                className="a11y-target rounded-lg border border-border px-5 py-3 text-sm text-foreground hover:bg-muted"
                aria-label="取消清空操作"
              >
                取消
              </button>
            </div>
          </motion.div>
        ) : (
          <button
            onClick={() => setConfirmAction('training')}
            className="a11y-target flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 py-3 text-sm font-medium text-destructive hover:bg-destructive/5 transition-colors"
            aria-label="清空训练数据（保留词表）"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            清空训练数据（保留词表）
          </button>
        )}

        {confirmAction === 'all' ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-lg bg-destructive/10 p-4"
          >
            <p className="text-sm text-foreground mb-3">
              确定要清空全部数据吗？词表、录音和设置将全部重置为默认值。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  onClearAll();
                  setConfirmAction(null);
                }}
                className="a11y-target rounded-lg bg-destructive px-5 py-3 text-sm font-medium text-destructive-foreground hover:opacity-90"
                aria-label="确认清空全部数据"
              >
                确认清空全部
              </button>
              <button
                onClick={() => setConfirmAction(null)}
                className="a11y-target rounded-lg border border-border px-5 py-3 text-sm text-foreground hover:bg-muted"
                aria-label="取消清空操作"
              >
                取消
              </button>
            </div>
          </motion.div>
        ) : (
          <button
            onClick={() => setConfirmAction('all')}
            className="a11y-target flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 py-3 text-sm font-medium text-destructive hover:bg-destructive/5 transition-colors"
            aria-label="清空全部数据"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            清空全部数据
          </button>
        )}
      </div>

      {/* Storage Info */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold text-foreground mb-2">存储说明</h3>
        <p className="text-sm text-muted-foreground">
          所有数据存储在浏览器本地（localStorage），不会上传到任何服务器。
          清除浏览器数据会导致训练数据丢失，建议定期导出备份。
        </p>
      </div>
    </section>
  );
}
