import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import ASRStreamingResult from '../../components/ASRStreamingResult';

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

describe('ASRStreamingResult', () => {
  const base = {
    partialText: '',
    finalText: '你好世界',
    onSpeak: vi.fn().mockResolvedValue(undefined),
    onStop: vi.fn(),
    isSpeaking: false,
  };

  beforeEach(() => { vi.clearAllMocks(); });

  // === Final result rendering ===

  it('renders final text prominently', () => {
    const { getByText } = render(<ASRStreamingResult {...base} />);
    expect(getByText('你好世界')).toBeInTheDocument();
    expect(getByText('识别完成')).toBeInTheDocument();
  });

  it('shows 朗读, 存为音色, 复制 buttons when no prompt audio', () => {
    const { getByText } = render(
      <ASRStreamingResult {...base} hasPromptAudio={false} onSaveVoice={vi.fn()} onClearVoice={vi.fn()} />
    );
    expect(getByText('朗读')).toBeInTheDocument();
    expect(getByText('存为音色')).toBeInTheDocument();
    expect(getByText('复制')).toBeInTheDocument();
  });

  it('hides 存为音色 when prompt audio already saved', () => {
    const { queryByText, getByText } = render(
      <ASRStreamingResult {...base} hasPromptAudio={true} onSaveVoice={vi.fn()} onClearVoice={vi.fn()} />
    );
    expect(queryByText('存为音色')).not.toBeInTheDocument();
    expect(getByText('朗读')).toBeInTheDocument();
    expect(getByText('复制')).toBeInTheDocument();
  });

  it('shows voice saved badge with clear button when hasPromptAudio', () => {
    const { getByText, getByLabelText } = render(
      <ASRStreamingResult {...base} hasPromptAudio={true} onSaveVoice={vi.fn()} onClearVoice={vi.fn()} />
    );
    expect(getByText('音色已保存 · 朗读将使用您的声音')).toBeInTheDocument();
    expect(getByLabelText('清除参考音频')).toBeInTheDocument();
  });

  // === Button interactions ===

  it('calls onSpeak with text when 朗读 clicked', async () => {
    const onSpeak = vi.fn();
    const { getByText } = render(<ASRStreamingResult {...base} onSpeak={onSpeak} />);
    await userEvent.click(getByText('朗读'));
    expect(onSpeak).toHaveBeenCalledWith('你好世界');
  });

  it('calls onStop when speaking and 停止 clicked', async () => {
    const onStop = vi.fn();
    const { getByText } = render(<ASRStreamingResult {...base} isSpeaking={true} onStop={onStop} />);
    await userEvent.click(getByText('停止'));
    expect(onStop).toHaveBeenCalled();
  });

  it('shows 停止 button label when isSpeaking', () => {
    const { getByText, queryByText } = render(<ASRStreamingResult {...base} isSpeaking={true} />);
    expect(getByText('停止')).toBeInTheDocument();
    expect(queryByText('朗读')).not.toBeInTheDocument();
  });

  it('calls onSaveVoice when 存为音色 clicked', async () => {
    const onSave = vi.fn();
    const { getByText } = render(
      <ASRStreamingResult {...base} hasPromptAudio={false} onSaveVoice={onSave} onClearVoice={vi.fn()} />
    );
    await userEvent.click(getByText('存为音色'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('calls onClearVoice when clear button clicked', async () => {
    const onClear = vi.fn();
    const { getByLabelText } = render(
      <ASRStreamingResult {...base} hasPromptAudio={true} onSaveVoice={vi.fn()} onClearVoice={onClear} />
    );
    await userEvent.click(getByLabelText('清除参考音频'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('copy button calls clipboard API', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const { getByText } = render(<ASRStreamingResult {...base} />);
    await userEvent.click(getByText('复制'));
    expect(writeText).toHaveBeenCalledWith('你好世界');
  });

  // === Partial text (streaming) ===

  it('renders streaming partial text with indicator', () => {
    const { getByText } = render(
      <ASRStreamingResult {...base} partialText="正在说..." finalText="" />
    );
    expect(getByText('正在说...')).toBeInTheDocument();
    expect(getByText('实时识别中')).toBeInTheDocument();
  });

  it('does not render partial UI when finalText exists', () => {
    const { queryByText } = render(
      <ASRStreamingResult {...base} partialText="partial" finalText="final" />
    );
    expect(queryByText('实时识别中')).not.toBeInTheDocument();
    expect(queryByText('final')).toBeInTheDocument();
  });

  // === Edge cases ===

  it('returns null when no text at all', () => {
    const { container } = render(
      <ASRStreamingResult {...base} partialText="" finalText="" />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders without clone props (backward compat)', () => {
    const { getByText, queryByText } = render(<ASRStreamingResult {...base} />);
    expect(getByText('朗读')).toBeInTheDocument();
    expect(queryByText('存为音色')).not.toBeInTheDocument();
    // no crash without onSaveVoice/onClearVoice
  });

  // === Accessibility ===

  it('has correct aria-labels', () => {
    const { getByLabelText } = render(
      <ASRStreamingResult {...base} hasPromptAudio={false} onSaveVoice={vi.fn()} onClearVoice={vi.fn()} />
    );
    expect(getByLabelText('朗读识别结果')).toBeInTheDocument();
    expect(getByLabelText('保存当前录音为音色')).toBeInTheDocument();
    expect(getByLabelText('复制识别结果')).toBeInTheDocument();
  });

  it('has correct aria-label when speaking', () => {
    const { getByLabelText } = render(<ASRStreamingResult {...base} isSpeaking={true} />);
    expect(getByLabelText('停止朗读')).toBeInTheDocument();
  });

  it('keyboard hints are visible', () => {
    const { container } = render(
      <ASRStreamingResult {...base} hasPromptAudio={false} onSaveVoice={vi.fn()} onClearVoice={vi.fn()} />
    );
    const kbds = container.querySelectorAll('kbd');
    const hints = Array.from(kbds).map(k => k.textContent);
    expect(hints).toContain('T');
    expect(hints).toContain('S');
    expect(hints).toContain('C');
  });
});
