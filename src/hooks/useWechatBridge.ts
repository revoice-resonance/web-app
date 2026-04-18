import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Detects WeChat Mini Program WebView environment and provides
 * a bridge to native recording capabilities.
 *
 * Communication flow:
 * 1. WebView calls wx.miniProgram.postMessage({ type: 'startRecord' })
 *    then wx.miniProgram.navigateTo to native recording page
 * 2. Native page records → uploads to ASR → stores transcript in globalData
 * 3. On navigateBack, webview.js reloads WebView URL with ?wxTranscript=...
 * 4. This hook reads the query param and provides the transcript
 */

declare global {
  interface Window {
    wx?: {
      miniProgram?: {
        postMessage: (data: { data: Record<string, unknown> }) => void;
        navigateTo: (opts: {
          url: string;
          success?: () => void;
          fail?: (err: unknown) => void;
        }) => void;
        redirectTo?: (opts: {
          url: string;
          success?: () => void;
          fail?: (err: unknown) => void;
        }) => void;
        navigateBack: () => void;
        getEnv?: (callback: (res: { miniprogram?: boolean }) => void) => void;
      };
    };
    __wxjs_environment?: string;
  }
}

interface WechatBridgeReturn {
  /** Whether we're inside a WeChat Mini Program WebView */
  isWechat: boolean;
  /** Trigger native recording flow */
  startNativeRecording: () => void;
  /** Transcript received from native recording (via URL params) */
  transcript: string | null;
  /** Recording duration from native recording */
  recordDuration: number;
  /** Clear the received transcript */
  clearTranscript: () => void;
}

function isWechatMiniProgramSync(): boolean {
  // Reliable sync checks only
  if (window.__wxjs_environment === 'miniprogram') return true;
  if (/miniProgram/i.test(navigator.userAgent)) return true;
  // If wx.miniProgram exists AND we're in a webview-like env (no getUserMedia), treat as wechat
  if (window.wx?.miniProgram && !navigator.mediaDevices?.getUserMedia) return true;
  return false;
}

/** Debug info for troubleshooting environment detection */
export function getWechatDebugInfo(): Record<string, unknown> {
  return {
    __wxjs_environment: window.__wxjs_environment,
    uaHasMiniProgram: /miniProgram/i.test(navigator.userAgent),
    hasWx: !!window.wx,
    hasMiniProgram: !!window.wx?.miniProgram,
    hasGetUserMedia: !!navigator.mediaDevices?.getUserMedia,
    isWechat: isWechatMiniProgramSync(),
  };
}

function getWxTranscriptFromUrl(): { transcript: string | null; duration: number } {
  const params = new URLSearchParams(window.location.search);
  const transcript = params.get('wxTranscript');
  const duration = parseFloat(params.get('wxDuration') || '0');
  return { transcript: transcript ? decodeURIComponent(transcript) : null, duration };
}

export function useWechatBridge(): WechatBridgeReturn {
  const [isWechat, setIsWechat] = useState(() => isWechatMiniProgramSync());
  const [transcript, setTranscript] = useState<string | null>(null);
  const [recordDuration, setRecordDuration] = useState(0);
  const initialChecked = useRef(false);

  // Async refinement for environments where jweixin exists but not in Mini Program
  useEffect(() => {
    let mounted = true;

    if (isWechatMiniProgramSync()) {
      setIsWechat(true);
      return () => {
        mounted = false;
      };
    }

    try {
      window.wx?.miniProgram?.getEnv?.((res) => {
        if (!mounted) return;
        setIsWechat(!!res?.miniprogram);
      });
    } catch (err) {
      console.warn('[WechatBridge] getEnv check failed:', err);
      if (mounted) setIsWechat(false);
    }

    return () => {
      mounted = false;
    };
  }, []);

  // On mount or URL change, check for transcript in URL params
  useEffect(() => {
    if (!isWechat) return;

    const { transcript: t, duration: d } = getWxTranscriptFromUrl();
    if (t && !initialChecked.current) {
      setTranscript(t);
      setRecordDuration(d);
      // Clean URL params without reload
      const url = new URL(window.location.href);
      url.searchParams.delete('wxTranscript');
      url.searchParams.delete('wxDuration');
      url.searchParams.delete('t');
      window.history.replaceState({}, '', url.toString());
    }
    initialChecked.current = true;
  }, [isWechat]);

  const startNativeRecording = useCallback(() => {
    const debugInfo = getWechatDebugInfo();
    console.log('[WechatBridge] startNativeRecording called', debugInfo);

    if (!window.wx?.miniProgram) {
      console.error('[WechatBridge] wx.miniProgram not available');
      alert('微信录音桥接不可用，请确认在微信小程序中打开');
      return;
    }

    // Reset state
    initialChecked.current = false;
    setTranscript(null);
    setRecordDuration(0);

    // Send message first (will be received on lifecycle events)
    try {
      window.wx.miniProgram.postMessage({ data: { type: 'startRecord' } });
    } catch (e) {
      console.warn('[WechatBridge] postMessage failed:', e);
    }

    // Navigate to native record page
    const url = '/pages/record/record';
    console.log('[WechatBridge] Calling navigateTo:', url);

    let navigated = false;

    try {
      window.wx.miniProgram.navigateTo({
        url,
        success: () => {
          navigated = true;
          console.log('[WechatBridge] navigateTo succeeded');
        },
        fail: (err: unknown) => {
          navigated = true;
          console.error('[WechatBridge] navigateTo failed:', err);
          // Try redirectTo as fallback
          try {
            window.wx?.miniProgram?.redirectTo?.({
              url,
              fail: (err2: unknown) => {
                console.error('[WechatBridge] redirectTo also failed:', err2);
                alert('无法打开录音页面 (navigateTo+redirectTo 均失败)\n' + JSON.stringify(err));
              },
            });
          } catch (e2) {
            alert('无法打开录音页面: ' + String(e2));
          }
        },
      });
    } catch (e) {
      console.error('[WechatBridge] navigateTo threw:', e);
      alert('navigateTo 异常: ' + String(e));
      return;
    }

    // Timeout fallback: if no callback fires within 3s, show alert
    setTimeout(() => {
      if (!navigated) {
        console.warn('[WechatBridge] navigateTo callback not fired within 3s');
        alert('录音页面可能未打开（3秒无响应）\n请检查小程序是否包含 pages/record/record 页面\n\n调试: ' + JSON.stringify(debugInfo));
      }
    }, 3000);
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript(null);
    setRecordDuration(0);
  }, []);

  return {
    isWechat,
    startNativeRecording,
    transcript,
    recordDuration,
    clearTranscript,
  };
}
