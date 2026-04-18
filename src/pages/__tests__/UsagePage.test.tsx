import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import UsagePage from '../UsagePage';

// ============ Mocks ============

const mockStartRecording = vi.fn();
const mockStopRecording = vi.fn().mockResolvedValue(null);
const mockTranscribe = vi.fn().mockResolvedValue(null);
const mockResetASR = vi.fn();
const mockStartNativeRecording = vi.fn();
const mockClearTranscript = vi.fn();

let mockIsRecording = false;
let mockRecError: string | null = null;
let mockFinalText = '';
let mockAsrError: string | null = null;
let mockWxTranscript = '';

vi.mock('@/hooks/useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    isRecording: mockIsRecording,
    duration: 3,
    startRecording: mockStartRecording,
    stopRecording: mockStopRecording,
    error: mockRecError,
    audioLevel: 0.5,
  }),
}));

vi.mock('@/hooks/useWhisperASR', () => ({
  useWhisperASR: () => ({
    finalText: mockFinalText,
    isProcessing: false,
    error: mockAsrError,
    transcribe: mockTranscribe,
    reset: mockResetASR,
  }),
}));

vi.mock('@/hooks/useWechatBridge', () => ({
  useWechatBridge: () => ({
    isWechat: false,
    startNativeRecording: mockStartNativeRecording,
    transcript: mockWxTranscript,
    clearTranscript: mockClearTranscript,
  }),
  getWechatDebugInfo: () => ({ env: 'test' }),
}));

vi.mock('@/hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock('@/hooks/useAccessibility', () => ({
  useAccessibility: () => ({ isMotionReduced: true }),
}));

vi.mock('framer-motion', () => {
  const forward = (tag: string) => {
    const Comp = ({ children, ...props }: any) => {
      const safe: Record<string, any> = {};
      for (const [k, v] of Object.entries(props)) {
        if (!['initial', 'animate', 'transition', 'whileTap', 'exit'].includes(k)) safe[k] = v;
      }
      const El = tag as any;
      return <El {...safe}>{children}</El>;
    };
    return Comp;
  };
  return { motion: { div: forward('div'), button: forward('button'), span: forward('span'), p: forward('p') } };
});

describe('UsagePage', () => {
  const defaultProps = {
    onSpeak: vi.fn().mockResolvedValue(undefined),
    onStop: vi.fn(),
    isSpeaking: false,
    hasPromptAudio: false,
    ttsError: null as string | null,
    onSetPromptAudio: vi.fn(),
    onClearPromptAudio: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRecording = false;
    mockRecError = null;
    mockFinalText = '';
    mockAsrError = null;
    mockWxTranscript = '';
  });

  // === Idle State ===

  it('renders idle state with title and record button', () => {
    const { getByText } = render(<UsagePage {...defaultProps} />);
    expect(getByText('语音识别')).toBeInTheDocument();
    expect(getByText('开始录音')).toBeInTheDocument();
  });

  it('shows keyboard hint in idle state', () => {
    const { getAllByText } = render(<UsagePage {...defaultProps} />);
    expect(getAllByText('空格').length).toBeGreaterThanOrEqual(1);
  });

  it('shows flow step "存音色" when no prompt audio', () => {
    const { getByText } = render(<UsagePage {...defaultProps} />);
    expect(getByText('存音色')).toBeInTheDocument();
  });

  it('shows flow step "✓ 音色" when prompt audio exists', () => {
    const { getByText } = render(<UsagePage {...defaultProps} hasPromptAudio={true} />);
    expect(getByText('✓ 音色')).toBeInTheDocument();
  });

  it('shows flow step labels: 录音, 识别, 朗读', () => {
    const { getByText } = render(<UsagePage {...defaultProps} />);
    expect(getByText('录音')).toBeInTheDocument();
    expect(getByText('识别')).toBeInTheDocument();
    expect(getByText('朗读')).toBeInTheDocument();
  });

  // === No Auto-speak ===

  it('does NOT auto-speak on mount', () => {
    render(<UsagePage {...defaultProps} />);
    expect(defaultProps.onSpeak).not.toHaveBeenCalled();
  });

  // === Error Display ===

  it('shows ttsError', () => {
    const { getByText } = render(<UsagePage {...defaultProps} ttsError="TTS 播放失败" />);
    expect(getByText('TTS 播放失败')).toBeInTheDocument();
  });

  it('shows recording error', () => {
    mockRecError = '麦克风权限被拒绝';
    const { getByText } = render(<UsagePage {...defaultProps} />);
    expect(getByText('麦克风权限被拒绝')).toBeInTheDocument();
  });

  it('shows ASR error', () => {
    mockAsrError = '识别服务不可用';
    const { getByText } = render(<UsagePage {...defaultProps} />);
    expect(getByText('识别服务不可用')).toBeInTheDocument();
  });

  it('error has role="alert"', () => {
    const { container } = render(<UsagePage {...defaultProps} ttsError="出错了" />);
    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toBe('出错了');
  });

  // === Debug Info ===

  it('renders debug details in dev mode', () => {
    const { getByText } = render(<UsagePage {...defaultProps} />);
    expect(getByText('调试信息')).toBeInTheDocument();
  });

  // === Heading Accessibility ===

  it('has h2 with correct id', () => {
    const { container } = render(<UsagePage {...defaultProps} />);
    const heading = container.querySelector('#usage-heading');
    expect(heading).toBeTruthy();
    expect(heading?.tagName).toBe('H2');
  });

  it('section has aria-labelledby pointing to heading', () => {
    const { container } = render(<UsagePage {...defaultProps} />);
    const section = container.querySelector('section');
    expect(section?.getAttribute('aria-labelledby')).toBe('usage-heading');
  });
});
