import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAudioRecorder } from '../useAudioRecorder';

// P0-2 回归防线：AudioContext 必须在 stopRecording / unmount 时 close
// 移动端单 tab ≤6 context 限制，泄漏会导致 3-5 次录音后崩溃

interface MockAudioContext {
  state: AudioContextState;
  close: ReturnType<typeof vi.fn>;
  createMediaStreamSource: ReturnType<typeof vi.fn>;
  createAnalyser: ReturnType<typeof vi.fn>;
  decodeAudioData: ReturnType<typeof vi.fn>;
}

const created: MockAudioContext[] = [];

function installAudioContextMock() {
  created.length = 0;
  const Ctor = vi.fn().mockImplementation(() => {
    const ctx: MockAudioContext = {
      state: 'running' as AudioContextState,
      close: vi.fn().mockImplementation(function (this: MockAudioContext) {
        this.state = 'closed';
        return Promise.resolve();
      }),
      createMediaStreamSource: vi.fn().mockReturnValue({ connect: vi.fn() }),
      createAnalyser: vi.fn().mockReturnValue({
        fftSize: 256,
        frequencyBinCount: 128,
        getByteFrequencyData: vi.fn(),
      }),
      decodeAudioData: vi.fn().mockResolvedValue({
        sampleRate: 16000,
        getChannelData: () => new Float32Array(1600),
      }),
    };
    created.push(ctx);
    return ctx;
  });
  vi.stubGlobal('AudioContext', Ctor);
}

function installMediaRecorderMock() {
  const handlers: Record<string, (() => void) | undefined> = {};
  const recorder = {
    state: 'inactive' as RecordingState,
    start: vi.fn().mockImplementation(function (this: typeof recorder) {
      this.state = 'recording';
    }),
    stop: vi.fn().mockImplementation(function (this: typeof recorder) {
      this.state = 'inactive';
      handlers.onstop?.();
    }),
    set onstop(cb: () => void) { handlers.onstop = cb; },
    set ondataavailable(_cb: (e: { data: Blob }) => void) { /* noop */ },
  };
  const Ctor = vi.fn().mockImplementation(() => recorder) as unknown as {
    new (): typeof recorder;
    isTypeSupported: (t: string) => boolean;
  };
  Ctor.isTypeSupported = () => true;
  vi.stubGlobal('MediaRecorder', Ctor);
  return recorder;
}

function installGetUserMediaMock() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  });
  return { stream, track };
}

describe('useAudioRecorder — P0-2 AudioContext 生命周期', () => {
  beforeEach(() => {
    installAudioContextMock();
    installMediaRecorderMock();
    installGetUserMediaMock();
    vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('初始状态正确', () => {
    const { result } = renderHook(() => useAudioRecorder());
    expect(result.current.isRecording).toBe(false);
    expect(result.current.audioLevel).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it('startRecording 创建 AudioContext', async () => {
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(created.length).toBe(1);
    expect(created[0].state).toBe('running');
  });

  it('stopRecording 关闭 AudioContext（防泄漏）', async () => {
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    // 模拟有效录音时长
    await new Promise((r) => setTimeout(r, 10));

    await act(async () => {
      await result.current.stopRecording({ includeWav: false });
    });

    // 首个 context（level 监控用）必须关闭
    expect(created[0].close).toHaveBeenCalledTimes(1);
    expect(created[0].state).toBe('closed');
  });

  it('unmount 兜底关闭 AudioContext（用户中途切页）', async () => {
    const { result, unmount } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(created[0].state).toBe('running');

    unmount();

    expect(created[0].close).toHaveBeenCalled();
    expect(created[0].state).toBe('closed');
  });

  it('连续 3 次录音不泄漏（每次都 close）', async () => {
    const { result } = renderHook(() => useAudioRecorder());

    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await result.current.startRecording();
      });
      await new Promise((r) => setTimeout(r, 10));
      await act(async () => {
        await result.current.stopRecording({ includeWav: false });
      });
    }

    // 3 次启动创建 3 个 level-monitoring context，全部关闭
    const levelContexts = created.slice(0, 3);
    expect(levelContexts.length).toBe(3);
    for (const ctx of levelContexts) {
      expect(ctx.state).toBe('closed');
    }
  });

  it('已关闭的 AudioContext 不重复 close（避免 InvalidStateError）', async () => {
    const { result, unmount } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.startRecording();
    });
    await new Promise((r) => setTimeout(r, 10));
    await act(async () => {
      await result.current.stopRecording({ includeWav: false });
    });

    const closeCalls = created[0].close.mock.calls.length;
    expect(closeCalls).toBe(1);

    unmount(); // 卸载时 context 已是 closed 状态
    expect(created[0].close.mock.calls.length).toBe(closeCalls); // 无额外调用
  });
});
