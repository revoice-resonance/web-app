import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Mic, RotateCcw } from 'lucide-react';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useWhisperASR } from '@/hooks/useWhisperASR';
import { useWechatBridge, getWechatDebugInfo } from '@/hooks/useWechatBridge';
import AudioRecorderButton from '@/components/AudioRecorderButton';
import ASRStreamingResult from '@/components/ASRStreamingResult';
import ASREngineIndicator from '@/components/ASREngineIndicator';
import { useASREnginePreference } from '@/hooks/useASREnginePreference';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useAccessibility } from '@/hooks/useAccessibility';
import { useCorpusCollection } from '@/hooks/useCorpusCollection';
import { toast } from 'sonner';

interface UsagePageProps {
  onSpeak: (text: string) => Promise<void>;
  onStop: () => void;
  isSpeaking: boolean;
  hasPromptAudio: boolean;
  ttsError: string | null;
  onSetPromptAudio: (blob: Blob, promptText?: string) => void;
  onClearPromptAudio: () => void;
}

type FlowState = 'idle' | 'recording' | 'processing' | 'result';

export default function UsagePage({
  onSpeak,
  onStop,
  isSpeaking,
  hasPromptAudio,
  ttsError,
  onSetPromptAudio,
  onClearPromptAudio,
}: UsagePageProps) {
  const { isRecording, duration, startRecording, stopRecording, error: recError, audioLevel } = useAudioRecorder();
  const [flowState, setFlowState] = useState<FlowState>('idle');
  const [lastTranscript, setLastTranscript] = useState('');
  const { isWechat, startNativeRecording, transcript: wxTranscript, clearTranscript } = useWechatBridge();

  // Keep the last WAV blob for voice cloning
  const lastWavBlobRef = useRef<Blob | null>(null);

  const {
    finalText,
    error: asrError,
    transcribe,
    reset: resetASR,
    engine: asrEngine,
    engineStage: asrEngineStage,
  } = useWhisperASR();

  const { collect: collectCorpus } = useCorpusCollection();
  const { preference: enginePref, setPreference: setEnginePref } = useASREnginePreference();

  // Handle transcript received from WeChat native recording
  useEffect(() => {
    if (wxTranscript) {
      setLastTranscript(wxTranscript);
      setFlowState('result');
      clearTranscript();
    }
  }, [wxTranscript, clearTranscript]);

  const handleStart = useCallback(async () => {
    if (isWechat) {
      startNativeRecording();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      if (window.wx?.miniProgram) {
        startNativeRecording();
        return;
      }
      toast.error('当前环境不支持录音，请在微信小程序或现代浏览器中使用');
      return;
    }
    setFlowState('recording');
    setLastTranscript('');
    lastWavBlobRef.current = null;
    await startRecording();
  }, [isWechat, startNativeRecording, startRecording]);

  const handleStop = useCallback(async () => {
    setFlowState('processing');

    const result = await stopRecording({ includeWav: true });
    if (!result) {
      setFlowState('idle');
      return;
    }

    const { webmBlob, wavBlob } = result;

    // Save real WAV only for voice prompt; never masquerade webm as wav
    lastWavBlobRef.current = wavBlob;

    const text = await transcribe(webmBlob, { prefer: enginePref });

    if (text) {
      setLastTranscript(text);
      // Auto-collect corpus in background
      collectCorpus(webmBlob, text, result.duration || 0);
    }

    // Go straight to result — no auto-speak
    setFlowState('result');
  }, [stopRecording, transcribe, collectCorpus, enginePref]);

  const handleSaveVoice = useCallback(() => {
    const wav = lastWavBlobRef.current;
    if (!wav) {
      toast.error('当前录音未能转换为标准 WAV，请重新录制后再存为音色');
      return;
    }
    onSetPromptAudio(wav, lastTranscript || undefined);
    toast.success('已保存参考音频，后续朗读将使用您的音色');
  }, [onSetPromptAudio, lastTranscript]);

  const handleClearVoice = useCallback(() => {
    onClearPromptAudio();
    toast.info('已清除参考音频');
  }, [onClearPromptAudio]);

  const handleReset = useCallback(() => {
    setFlowState('idle');
    setLastTranscript('');
    lastWavBlobRef.current = null;
    resetASR();
  }, [resetASR]);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success('已复制到剪贴板');
    });
  }, []);

  const displayText = finalText || lastTranscript;

  // Keyboard shortcuts
  const shortcuts = useMemo(
    () => [
      {
        key: ' ',
        label: '录音',
        description: '开始/停止录音',
        handler: () => {
          if (flowState === 'idle') handleStart();
          else if (flowState === 'recording') handleStop();
        },
        enabled: flowState === 'idle' || flowState === 'recording',
      },
      {
        key: 'r',
        label: '重置',
        description: '再说一次',
        handler: handleReset,
        enabled: flowState === 'result',
      },
      {
        key: 't',
        label: '朗读',
        description: '朗读识别结果',
        handler: () => {
          if (displayText) {
            if (isSpeaking) { onStop(); } else { onSpeak(displayText); }
          }
        },
        enabled: flowState === 'result' && !!displayText,
      },
      {
        key: 's',
        label: '存音色',
        description: '保存当前录音为音色',
        handler: handleSaveVoice,
        enabled: flowState === 'result' && !hasPromptAudio && !!lastWavBlobRef.current,
      },
      {
        key: 'c',
        label: '复制',
        description: '复制文本',
        handler: () => {
          if (displayText) handleCopy(displayText);
        },
        enabled: flowState === 'result' && !!displayText,
      },
      {
        key: 'Escape',
        label: '取消',
        description: '取消录音',
        handler: () => {
          if (flowState === 'recording') {
            stopRecording();
            resetASR();
            setFlowState('idle');
          }
        },
        enabled: flowState === 'recording',
      },
    ],
    [flowState, handleStart, handleStop, handleReset, handleCopy, handleSaveVoice, displayText, hasPromptAudio, isSpeaking, onSpeak, onStop, stopRecording, resetASR]
  );

  useKeyboardShortcuts(shortcuts, 'high');
  const { isMotionReduced } = useAccessibility();

  return (
    <section className="max-w-lg mx-auto space-y-5 relative" aria-labelledby="usage-heading">
      {/* Decorative background blobs */}
      <div className="pointer-events-none absolute -top-20 -left-20 h-40 w-40 rounded-full bg-primary/8 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -top-10 -right-16 h-32 w-32 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />

      {/* Header */}
      <div className="text-center">
        <motion.div
          initial={isMotionReduced ? {} : { opacity: 0, y: -10 }}
          animate={isMotionReduced ? {} : { opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h2 id="usage-heading" className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
            语音识别
          </h2>
          <div className="mt-2 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">录音</span>
            <span className="text-muted-foreground/40">→</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">识别</span>
            <span className="text-muted-foreground/40">→</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
              {hasPromptAudio ? '✓ 音色' : '存音色'}
            </span>
            <span className="text-muted-foreground/40">/</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">朗读</span>
          </div>
        </motion.div>
      </div>

      {/* Engine selection moved to Settings page — keep recording UI minimal */}
      {flowState === 'idle' && (
        <motion.div
          initial={isMotionReduced ? {} : { opacity: 0 }}
          animate={isMotionReduced ? {} : { opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="flex items-center justify-center gap-2 text-xs text-muted-foreground"
        >
          <span>按</span>
          <kbd className="kbd-hint">空格</kbd>
          <span>开始录音</span>
        </motion.div>
      )}

      {/* Recording Area */}
      {(flowState === 'idle' || flowState === 'recording') && (
        <motion.div
          initial={isMotionReduced ? {} : { opacity: 0, y: 12 }}
          animate={isMotionReduced ? {} : { opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="relative rounded-2xl border border-border/60 bg-gradient-to-b from-card to-card/80 p-6 md:p-8 shadow-lg shadow-primary/5 overflow-hidden"
        >
          {isRecording && (
            <div className="absolute inset-0 bg-gradient-to-t from-recording/5 to-transparent pointer-events-none" aria-hidden="true" />
          )}
          <div className="relative flex flex-col items-center">
            <AudioRecorderButton
              isRecording={isRecording}
              duration={duration}
              audioLevel={audioLevel}
              onStart={handleStart}
              onStop={handleStop}
              size="lg"
            />
          </div>
        </motion.div>
      )}

      {/* Processing state */}
      {flowState === 'processing' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="relative rounded-2xl border border-border/60 bg-gradient-to-b from-card to-card/80 p-8 text-center space-y-4 shadow-lg shadow-primary/5 overflow-hidden"
          role="status"
          aria-live="polite"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-primary/3 to-transparent pointer-events-none" aria-hidden="true" />
          <div className="relative mx-auto h-14 w-14">
            <div className="absolute inset-0 rounded-full bg-primary/10" aria-hidden="true" />
            <div className="absolute inset-0 rounded-full border-[3px] border-primary/20" aria-hidden="true" />
            <div className="absolute inset-0 rounded-full border-[3px] border-primary border-t-transparent animate-spin" aria-hidden="true" />
          </div>
          <p className="relative text-foreground font-semibold">正在识别语音...</p>
          <ASREngineIndicator engine={asrEngine} stage={asrEngineStage} className="relative" />
        </motion.div>
      )}

      {/* Results — user chooses action */}
      {flowState === 'result' && (
        <>
          {/* Always show the engine chain so users see which layer succeeded */}
          <ASREngineIndicator engine={asrEngine} stage={asrEngineStage} />
          {displayText ? (
            <ASRStreamingResult
              partialText=""
              finalText={displayText}
              onSpeak={onSpeak}
              onStop={onStop}
              isSpeaking={isSpeaking}
              hasPromptAudio={hasPromptAudio}
              onSaveVoice={handleSaveVoice}
              onClearVoice={handleClearVoice}
            />
          ) : (
            <motion.div
              initial={isMotionReduced ? {} : { opacity: 0 }}
              animate={isMotionReduced ? {} : { opacity: 1 }}
              className="rounded-2xl border border-border/60 bg-card p-8 text-center"
              role="alert"
            >
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Mic className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="text-sm text-muted-foreground">未能识别到语音内容，请重试</p>
            </motion.div>
          )}

          <motion.button
            initial={isMotionReduced ? {} : { opacity: 0, y: 5 }}
            animate={isMotionReduced ? {} : { opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            onClick={handleReset}
            className="a11y-target flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 py-3.5 text-sm font-semibold text-primary hover:from-primary/15 hover:to-accent/15 transition-all"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            再说一次
            <kbd className="kbd-hint ml-2" aria-hidden="true">R</kbd>
          </motion.button>
        </>
      )}

      {(recError || asrError || ttsError) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl bg-destructive/10 border border-destructive/20 p-3.5 text-sm text-destructive"
          role="alert"
        >
          {recError || asrError || ttsError}
        </motion.div>
      )}

      {/* Debug info */}
      {(isWechat || import.meta.env.DEV) && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">调试信息</summary>
          <pre className="mt-1 rounded-lg bg-muted p-2 overflow-auto max-h-32">
            {JSON.stringify(getWechatDebugInfo(), null, 2)}
          </pre>
        </details>
      )}
    </section>
  );
}
