import { useState, useCallback } from 'react';
import { toast } from 'sonner';

export type ASREngine = 'whisper' | 'gemini' | 'browser';
export type ASREngineStage =
  | 'idle'
  | 'whisper-trying'
  | 'gemini-trying'
  | 'browser-trying'
  | 'success'
  | 'failed';

interface TranscribeOptions {
  /** Force a specific engine. When set, no fallback is performed. */
  prefer?: 'auto' | 'whisper' | 'gemini' | 'browser';
}

interface UseWhisperASRReturn {
  finalText: string;
  isProcessing: boolean;
  error: string | null;
  transcribe: (audioBlob: Blob, options?: TranscribeOptions) => Promise<string | null>;
  reset: () => void;
  /** Which engine produced the final transcript (or is being tried) */
  engine: ASREngine | null;
  /** Fine-grained stage for showing progress UI to the user */
  engineStage: ASREngineStage;
}

/**
 * Try browser-native Web Speech API as fallback when Whisper is offline.
 * Returns the transcript or null if unsupported / failed.
 */
function browserSpeechFallback(): Promise<string | null> {
  return new Promise((resolve) => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      resolve(null);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    let settled = false;
    const finish = (text: string | null) => {
      if (settled) return;
      settled = true;
      resolve(text);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim() || '';
      finish(transcript || null);
    };
    recognition.onerror = () => finish(null);
    recognition.onnomatch = () => finish(null);
    recognition.onend = () => finish(null);

    setTimeout(() => finish(null), 8000);
    recognition.start();
  });
}

/**
 * Call Gemini ASR via Worker proxy as fallback when Whisper is offline.
 * IMPORTANT: All API traffic must go through our Worker (same origin) — never
 * call Supabase / Google directly from the browser. China network conditions
 * make direct *.supabase.co calls unreliable.
 */
async function geminiASRFallback(audioBlob: Blob): Promise<string | null> {
  const apiBase = import.meta.env.VITE_WORKER_API_URL || '';
  const formData = new FormData();
  formData.append('file', audioBlob, 'recording.webm');

  const response = await fetch(`${apiBase}/api/gemini-asr`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json().catch(() => ({} as { ok?: boolean; text?: string }));
  if (data.ok && data.text?.trim()) {
    return data.text.trim();
  }
  return null;
}

export function useWhisperASR(): UseWhisperASRReturn {
  const [finalText, setFinalText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<ASREngine | null>(null);
  const [engineStage, setEngineStage] = useState<ASREngineStage>('idle');

  const transcribe = useCallback(async (audioBlob: Blob, options?: TranscribeOptions): Promise<string | null> => {
    const prefer = options?.prefer ?? 'auto';

    setError(null);
    setIsProcessing(true);
    setFinalText('');
    setEngine(null);

    /** Helper: call Whisper via Worker. Throws on hard failure. */
    const callWhisper = async (): Promise<{ text: string; source: ASREngine } | null> => {
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');
      const apiBase = import.meta.env.VITE_WORKER_API_URL || '';
      const response = await fetch(`${apiBase}/api/whisper-asr`, { method: 'POST', body: formData });
      if (!response.ok) throw new Error(`Worker ${response.status}`);
      const data = await response.json().catch(() => ({} as any));
      if (data.ok === false) throw new Error(data.error || 'Whisper failed');
      const text = (data.text || '').trim();
      if (!text) return null;
      // Worker may have internally fallen back to Gemini; respect its source
      const source: ASREngine = data.source === 'gemini' ? 'gemini' : 'whisper';
      return { text, source };
    };

    // === Forced single-engine modes (no fallback) ===
    if (prefer === 'whisper') {
      setEngineStage('whisper-trying');
      try {
        const result = await callWhisper();
        if (result?.text) {
          setEngine(result.source);
          setEngineStage('success');
          setFinalText(result.text);
          setIsProcessing(false);
          return result.text;
        }
        setEngineStage('failed');
        setError('Whisper 未能识别到语音内容');
      } catch (err) {
        console.warn('[ASR] Whisper-only failed:', err);
        setEngineStage('failed');
        setError('Whisper 服务不可用，请切换其他引擎或选 auto');
      }
      setIsProcessing(false);
      return null;
    }

    if (prefer === 'gemini') {
      setEngineStage('gemini-trying');
      try {
        const text = await geminiASRFallback(audioBlob);
        if (text) {
          setEngine('gemini');
          setEngineStage('success');
          setFinalText(text);
          setIsProcessing(false);
          return text;
        }
        setEngineStage('failed');
        setError('Gemini 未能识别到语音内容');
      } catch (err) {
        console.warn('[ASR] Gemini-only failed:', err);
        setEngineStage('failed');
        setError('Gemini 服务不可用，请切换其他引擎');
      }
      setIsProcessing(false);
      return null;
    }

    if (prefer === 'browser') {
      setEngineStage('browser-trying');
      const text = await browserSpeechFallback();
      if (text) {
        setEngine('browser');
        setEngineStage('success');
        setFinalText(text);
        setIsProcessing(false);
        return text;
      }
      setEngineStage('failed');
      setError('浏览器内置识别不可用或没听清（仅 Chrome/Edge 桌面版支持）');
      setIsProcessing(false);
      return null;
    }

    // === Auto mode: full Whisper → Gemini → Browser fallback chain ===
    setEngineStage('whisper-trying');

    const tryGeminiThenBrowser = async (): Promise<string | null> => {
      setEngineStage('gemini-trying');
      try {
        const geminiText = await geminiASRFallback(audioBlob);
        if (geminiText) {
          setEngine('gemini');
          setEngineStage('success');
          setFinalText(geminiText);
          setIsProcessing(false);
          return geminiText;
        }
      } catch (geminiErr) {
        console.warn('[ASR] Gemini fallback failed:', geminiErr);
      }

      setEngineStage('browser-trying');
      const browserText = await browserSpeechFallback();
      if (browserText) {
        setEngine('browser');
        setEngineStage('success');
        setFinalText(browserText);
        setIsProcessing(false);
        return browserText;
      }

      setEngineStage('failed');
      setError('所有语音识别服务均不可用，请稍后重试');
      setIsProcessing(false);
      return null;
    };

    try {
      const result = await callWhisper();
      if (result?.text) {
        setEngine(result.source);
        setEngineStage('success');
        setFinalText(result.text);
        setIsProcessing(false);
        return result.text;
      }
      setEngineStage('failed');
      setError('未能识别到语音内容');
      setIsProcessing(false);
      return null;
    } catch (err) {
      console.warn('[ASR] Worker call failed in auto mode, falling back:', err);
      return await tryGeminiThenBrowser();
    }
  }, []);

  const reset = useCallback(() => {
    setFinalText('');
    setIsProcessing(false);
    setError(null);
    setEngine(null);
    setEngineStage('idle');
  }, []);

  return { finalText, isProcessing, error, transcribe, reset, engine, engineStage };
}
