import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppSettings, DEFAULT_SETTINGS } from '@/types';
import { useTTS } from '@/hooks/useTTS';
import AccessibilitySettings from '@/components/AccessibilitySettings';
import AccessibleStepper from '@/components/AccessibleStepper';
import ASREngineCard from '@/components/ASREngineCard';
import DiagnosticsPanel from '@/components/DiagnosticsPanel';
import {
  ChevronDown,
  Volume2,
  RotateCcw,
  FlaskConical,
  List,
  Mic,
  ChevronRight,
} from 'lucide-react';

interface SettingsPageProps {
  settings: AppSettings;
  onUpdate: (settings: AppSettings) => void;
}

/**
 * Settings page — restructured into:
 *   1. Basic settings (always visible): ASR engine, TTS voice, Accessibility
 *   2. Advanced settings (collapsed by default): Privacy/Diagnostics
 *   3. Experimental (collapsed): unfinished features (Phrases, Training)
 *   4. Reset (footer)
 *
 * Old "识别参数" (Top-K / threshold / template count) was removed because
 * the current Whisper/Gemini ASR pipeline does not consume those values
 * — they were leftovers from an early template-matching engine.
 */
export default function SettingsPage({ settings, onUpdate }: SettingsPageProps) {
  const { voices, hasChineseVoice } = useTTS();
  const navigate = useNavigate();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [experimentalOpen, setExperimentalOpen] = useState(false);

  const update = (key: keyof AppSettings, value: number | string) => {
    onUpdate({ ...settings, [key]: value });
  };

  return (
    <section className="max-w-2xl mx-auto space-y-6 pb-12" aria-labelledby="settings-heading">
      {/* Page header */}
      <header>
        <h2
          id="settings-heading"
          className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"
        >
          设置
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">基础设置即开即用，进阶选项已折叠</p>
      </header>

      {/* ============ BASIC SETTINGS ============ */}
      <div className="space-y-5">
        {/* 1. ASR engine — large visual card */}
        <ASREngineCard />

        {/* 2. TTS voice */}
        <div className="rounded-2xl border border-border bg-card p-5 md:p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent/15 to-primary/15">
              <Volume2 className="h-5 w-5 text-accent" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-base">朗读声音</h3>
              <p className="text-xs text-muted-foreground">调整文字朗读的语速、音量与音色</p>
            </div>
          </div>

          {!hasChineseVoice && (
            <div className="rounded-lg bg-warning/15 p-3 text-xs text-warning-foreground" role="alert">
              ⚠️ 未检测到中文语音包，朗读可能无法正常工作。请在系统设置中安装中文语音。
            </div>
          )}

          <div className="space-y-4">
            <AccessibleStepper
              label="语速"
              value={settings.ttsRate}
              min={0.5}
              max={2}
              step={0.1}
              onChange={(v) => update('ttsRate', v)}
              format={(v) => `${v.toFixed(1)}x`}
              id="ttsRate"
            />
            <AccessibleStepper
              label="音量"
              value={settings.ttsVolume}
              min={0}
              max={1}
              step={0.1}
              onChange={(v) => update('ttsVolume', v)}
              format={(v) => `${Math.round(v * 100)}%`}
              id="ttsVolume"
            />

            {voices.length > 0 && (
              <div>
                <label htmlFor="ttsVoice" className="text-sm font-medium text-foreground block mb-1.5">
                  音色
                </label>
                <select
                  id="ttsVoice"
                  value={settings.ttsVoice}
                  onChange={(e) => update('ttsVoice', e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring a11y-target"
                  aria-label="选择朗读音色"
                >
                  <option value="">自动选择</option>
                  {voices
                    .filter((v) => v.lang.startsWith('zh'))
                    .map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* 3. Accessibility */}
        <AccessibilitySettings />
      </div>

      {/* ============ ADVANCED ============ */}
      <details
        open={advancedOpen}
        onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
        className="group rounded-2xl border border-border bg-card overflow-hidden"
      >
        <summary className="a11y-target flex items-center justify-between cursor-pointer px-5 py-4 hover:bg-muted/30 transition-colors list-none">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden="true" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">高级设置</div>
              <div className="text-xs text-muted-foreground">隐私、诊断日志、音高微调等</div>
            </div>
          </div>
        </summary>

        <div className="border-t border-border p-5 space-y-5">
          {/* TTS pitch — niche control, hidden in advanced */}
          <div className="rounded-xl bg-muted/20 p-4 space-y-3">
            <div className="text-sm font-medium text-foreground">朗读微调</div>
            <AccessibleStepper
              label="音高"
              value={settings.ttsPitch}
              min={0.5}
              max={2}
              step={0.1}
              onChange={(v) => update('ttsPitch', v)}
              format={(v) => v.toFixed(1)}
              id="ttsPitch"
            />
          </div>

          {/* Privacy + diagnostics */}
          <DiagnosticsPanel />
        </div>
      </details>

      {/* ============ EXPERIMENTAL ============ */}
      <details
        open={experimentalOpen}
        onToggle={(e) => setExperimentalOpen((e.target as HTMLDetailsElement).open)}
        className="group rounded-2xl border border-dashed border-border bg-card/50 overflow-hidden"
      >
        <summary className="a11y-target flex items-center justify-between cursor-pointer px-5 py-4 hover:bg-muted/30 transition-colors list-none">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <FlaskConical className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                实验功能
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning-foreground">
                  暂未启用
                </span>
              </div>
              <div className="text-xs text-muted-foreground">尚未接入识别管线，仅供探索</div>
            </div>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>

        <div className="border-t border-border divide-y divide-border">
          <button
            onClick={() => navigate('/phrases')}
            className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-muted/40 transition-colors a11y-target"
          >
            <List className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">词表管理</div>
              <p className="text-xs text-muted-foreground">添加、编辑、导入导出短语（不影响当前识别）</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
          </button>
          <button
            onClick={() => navigate('/training')}
            className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-muted/40 transition-colors a11y-target"
          >
            <Mic className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">录音训练</div>
              <p className="text-xs text-muted-foreground">为短语录制语音样本（个性化识别上线后启用）</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
          </button>
        </div>
      </details>

      {/* ============ FOOTER ============ */}
      <button
        onClick={() => onUpdate(DEFAULT_SETTINGS)}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-medium text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/5 transition-colors a11y-target"
        aria-label="恢复默认设置"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        恢复默认设置
      </button>
    </section>
  );
}
