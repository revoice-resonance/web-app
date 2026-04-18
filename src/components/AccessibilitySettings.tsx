import { useAccessibility } from '@/hooks/useAccessibility';
import { Eye, Zap, Type, Hand, Focus, RotateCcw, MousePointer, Shield, Timer } from 'lucide-react';

const FONT_SCALE_OPTIONS = [
  { value: 0.875, label: '较小' },
  { value: 1, label: '默认' },
  { value: 1.15, label: '大' },
  { value: 1.3, label: '较大' },
  { value: 1.5, label: '最大' },
];

const MOTION_OPTIONS = [
  { value: 'system' as const, label: '跟随系统' },
  { value: 'off' as const, label: '开启动画' },
  { value: 'on' as const, label: '关闭动画' },
];

const CONTRAST_OPTIONS = [
  { value: 'system' as const, label: '跟随系统' },
  { value: 'off' as const, label: '标准对比度' },
  { value: 'on' as const, label: '增强对比度' },
];

const DWELL_OPTIONS = [
  { value: 0, label: '关闭' },
  { value: 600, label: '快 (0.6s)' },
  { value: 1000, label: '中 (1s)' },
  { value: 1500, label: '慢 (1.5s)' },
  { value: 2500, label: '很慢 (2.5s)' },
];

const DEBOUNCE_OPTIONS = [
  { value: 0, label: '关闭' },
  { value: 200, label: '轻微 (0.2s)' },
  { value: 400, label: '适中 (0.4s)' },
  { value: 700, label: '较强 (0.7s)' },
];

function OptionButton({
  isActive,
  onClick,
  children,
  ariaLabel,
  ariaPressed,
}: {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
  ariaPressed?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors a11y-target ${
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
      }`}
      aria-pressed={ariaPressed ?? isActive}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

function Toggle({
  checked,
  onToggle,
  label,
  description,
  icon: Icon,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  description: string;
  icon: React.ElementType;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
        <div>
          <label className="text-sm font-medium text-foreground">{label}</label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <button
        onClick={onToggle}
        className={`relative h-8 w-14 flex-shrink-0 rounded-full transition-colors a11y-target ${
          checked ? 'bg-primary' : 'bg-muted'
        }`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-7' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

export default function AccessibilitySettings() {
  const { settings, update, reset, isMotionReduced, isHighContrast } = useAccessibility();

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10" aria-hidden="true">
            <Eye className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">辅助功能</h3>
            <p className="text-xs text-muted-foreground">参照 Apple Accessibility 标准</p>
          </div>
        </div>
      </div>

      {/* === 运动控制 Section === */}
      <div className="space-y-4 rounded-lg border border-border p-4">
        <div className="flex items-center gap-2">
          <MousePointer className="h-4 w-4 text-primary" aria-hidden="true" />
          <h4 className="text-sm font-semibold text-foreground">运动控制辅助</h4>
        </div>

        {/* Dwell Control - like Apple's Dwell Control */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <label className="text-sm font-medium text-foreground">停留控制</label>
            <span className="text-xs text-muted-foreground ml-auto">
              {DWELL_OPTIONS.find((o) => o.value === settings.dwellTimeMs)?.label || `${settings.dwellTimeMs}ms`}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {DWELL_OPTIONS.map((opt) => (
              <OptionButton
                key={opt.value}
                isActive={settings.dwellTimeMs === opt.value}
                onClick={() => update('dwellTimeMs', opt.value)}
                ariaLabel={`停留控制: ${opt.label}`}
              >
                {opt.label}
              </OptionButton>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            类似 Apple「停留控制」，鼠标悬停在按钮上足够时间后自动点击，无需按下鼠标
          </p>
        </div>

        {/* Click Debounce */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <label className="text-sm font-medium text-foreground">防误触</label>
            <span className="text-xs text-muted-foreground ml-auto">
              {DEBOUNCE_OPTIONS.find((o) => o.value === settings.clickDebounceMs)?.label || `${settings.clickDebounceMs}ms`}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {DEBOUNCE_OPTIONS.map((opt) => (
              <OptionButton
                key={opt.value}
                isActive={settings.clickDebounceMs === opt.value}
                onClick={() => update('clickDebounceMs', opt.value)}
                ariaLabel={`防误触: ${opt.label}`}
              >
                {opt.label}
              </OptionButton>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            防止手部震颤导致的重复点击，短时间内的多次点击只会执行一次
          </p>
        </div>

        {/* Large Touch Targets */}
        <Toggle
          checked={settings.largeTouchTargets}
          onToggle={() => update('largeTouchTargets', !settings.largeTouchTargets)}
          label="大号点击区域"
          description="增大按钮和交互元素尺寸"
          icon={Hand}
        />
      </div>

      {/* === 显示 Section === */}
      <div className="space-y-4 rounded-lg border border-border p-4">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" aria-hidden="true" />
          <h4 className="text-sm font-semibold text-foreground">显示与文字</h4>
        </div>

        {/* Font Scale - Dynamic Type */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Type className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <label className="text-sm font-medium text-foreground">字体大小</label>
            <span className="text-xs text-muted-foreground ml-auto">
              {FONT_SCALE_OPTIONS.find((o) => o.value === settings.fontScale)?.label || `${Math.round(settings.fontScale * 100)}%`}
            </span>
          </div>
          <div className="flex gap-2">
            {FONT_SCALE_OPTIONS.map((opt) => (
              <OptionButton
                key={opt.value}
                isActive={settings.fontScale === opt.value}
                onClick={() => update('fontScale', opt.value)}
                ariaLabel={`字体大小: ${opt.label}`}
              >
                <span style={{ fontSize: `${opt.value * 0.85}rem` }}>文</span>
              </OptionButton>
            ))}
          </div>
        </div>

        {/* Reduce Motion */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <label className="text-sm font-medium text-foreground">减弱动态效果</label>
            <span className="text-xs text-muted-foreground ml-auto">
              {isMotionReduced ? '已开启' : '未开启'}
            </span>
          </div>
          <div className="flex gap-2">
            {MOTION_OPTIONS.map((opt) => (
              <OptionButton
                key={opt.value}
                isActive={settings.reduceMotion === opt.value}
                onClick={() => update('reduceMotion', opt.value)}
              >
                {opt.label}
              </OptionButton>
            ))}
          </div>
        </div>

        {/* High Contrast */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <label className="text-sm font-medium text-foreground">增强对比度</label>
            <span className="text-xs text-muted-foreground ml-auto">
              {isHighContrast ? '已开启' : '未开启'}
            </span>
          </div>
          <div className="flex gap-2">
            {CONTRAST_OPTIONS.map((opt) => (
              <OptionButton
                key={opt.value}
                isActive={settings.highContrast === opt.value}
                onClick={() => update('highContrast', opt.value)}
              >
                {opt.label}
              </OptionButton>
            ))}
          </div>
        </div>

        {/* Always Show Focus */}
        <Toggle
          checked={settings.alwaysShowFocus}
          onToggle={() => update('alwaysShowFocus', !settings.alwaysShowFocus)}
          label="始终显示焦点"
          description="点击时也显示焦点环"
          icon={Focus}
        />
      </div>

      {/* Reset */}
      <button
        onClick={reset}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors a11y-target"
        aria-label="恢复辅助功能默认设置"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        恢复辅助功能默认设置
      </button>
    </div>
  );
}
