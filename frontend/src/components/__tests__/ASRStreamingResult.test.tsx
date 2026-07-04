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

  it('shows 朗读 and 复制 buttons', () => {
    const { getByText } = render(<ASRStreamingResult {...base} />);
    expect(getByText('朗读')).toBeInTheDocument();
    expect(getByText('复制')).toBeInTheDocument();
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

  it('renders with minimal props', () => {
    const { getByText } = render(<ASRStreamingResult {...base} />);
    expect(getByText('朗读')).toBeInTheDocument();
    expect(getByText('复制')).toBeInTheDocument();
    // no crash without onSaveVoice/onClearVoice — those props are removed
  });

  // === Accessibility ===

  it('has correct aria-labels', () => {
    const { getByLabelText } = render(<ASRStreamingResult {...base} />);
    expect(getByLabelText('朗读识别结果')).toBeInTheDocument();
    expect(getByLabelText('复制识别结果')).toBeInTheDocument();
  });

  it('has correct aria-label when speaking', () => {
    const { getByLabelText } = render(<ASRStreamingResult {...base} isSpeaking={true} />);
    expect(getByLabelText('停止朗读')).toBeInTheDocument();
  });

  it('keyboard hints are visible', () => {
    const { container } = render(<ASRStreamingResult {...base} />);
    const kbds = container.querySelectorAll('kbd');
    const hints = Array.from(kbds).map(k => k.textContent);
    expect(hints).toContain('T');
    expect(hints).toContain('C');
  });
});
