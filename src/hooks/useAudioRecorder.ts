import { useState, useCallback, useRef } from 'react';

interface RecordingResult {
  /** Compressed webm blob — small, ideal for ASR upload */
  webmBlob: Blob;
  /** PCM WAV blob — needed by voice-cloning APIs; null if conversion failed */
  wavBlob: Blob | null;
  /** Alias for wavBlob (backward compat); falls back to webmBlob */
  blob: Blob;
  duration: number;
}

interface StopRecordingOptions {
  /** Whether to generate WAV (CPU-heavy). Disable when only ASR is needed. */
  includeWav?: boolean;
}

interface UseAudioRecorderReturn {
  isRecording: boolean;
  duration: number;
  startRecording: () => Promise<void>;
  stopRecording: (options?: StopRecordingOptions) => Promise<RecordingResult | null>;
  error: string | null;
  audioLevel: number;
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopLevelMonitoring = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const startLevelMonitoring = useCallback((stream: MediaStream) => {
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const updateLevel = () => {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setAudioLevel(avg / 128);
      animFrameRef.current = requestAnimationFrame(updateLevel);
    };
    updateLevel();
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // Pre-flight: catch common mobile/HTTPS issues with clearer messages
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('当前浏览器不支持录音。请用微信内置浏览器或最新版 Chrome/Safari 打开');
        return;
      }
      const isSecure = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!isSecure) {
        setError('录音需要 HTTPS。请通过 https:// 地址访问本页面');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
        // Lower bitrate = smaller upload payload for faster ASR
        audioBitsPerSecond: 24000,
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start(250);
      startTimeRef.current = Date.now();
      setIsRecording(true);
      setDuration(0);

      intervalRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 200);

      startLevelMonitoring(stream);
    } catch (err) {
      console.error('Recording error:', err);
      const name = (err as DOMException)?.name || '';
      const msg = (err as Error)?.message || '';

      if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || /denied|not allowed/i.test(msg)) {
        setError('麦克风权限被拒绝。请在浏览器设置→网站权限中允许本站使用麦克风后刷新页面');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('未检测到麦克风设备');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setError('麦克风被其他应用占用，请关闭后重试');
      } else if (name === 'SecurityError' || /secure|https/i.test(msg)) {
        setError('录音需要 HTTPS 安全上下文。请通过 https:// 地址访问');
      } else if (name === 'AbortError') {
        setError('录音被中断，请重试');
      } else {
        setError(`无法访问麦克风：${msg || '未知错误'}`);
      }
    }
  }, [startLevelMonitoring]);

  const convertToWav = useCallback(async (webmBlob: Blob): Promise<Blob> => {
    const arrayBuffer = await webmBlob.arrayBuffer();
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const numChannels = 1;
    const sampleRate = audioBuffer.sampleRate;
    const samples = audioBuffer.getChannelData(0);
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    await audioContext.close();
    return new Blob([buffer], { type: 'audio/wav' });
  }, []);

  const stopRecording = useCallback(async (options?: StopRecordingOptions): Promise<RecordingResult | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        resolve(null);
        return;
      }

      const includeWav = options?.includeWav ?? true;

      recorder.onstop = async () => {
        const finalDuration = (Date.now() - startTimeRef.current) / 1000;
        const webmBlob = new Blob(chunksRef.current, { type: 'audio/webm' });

        if (intervalRef.current) clearInterval(intervalRef.current);
        stopLevelMonitoring();

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        setIsRecording(false);
        setDuration(0);

        if (finalDuration < 0.3) {
          setError('录音时间太短，请重试');
          resolve(null);
        } else {
          let wavBlob: Blob | null = null;
          if (includeWav) {
            try {
              wavBlob = await convertToWav(webmBlob);
            } catch (e) {
              console.warn('WAV conversion failed, voice prompt save disabled:', e);
              wavBlob = null;
            }
          }
          resolve({ webmBlob, wavBlob, blob: wavBlob ?? webmBlob, duration: finalDuration });
        }
      };

      recorder.stop();
    });
  }, [stopLevelMonitoring, convertToWav]);

  return { isRecording, duration, startRecording, stopRecording, error, audioLevel };
}
