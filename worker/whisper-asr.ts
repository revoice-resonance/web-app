/**
 * Whisper ASR handler — forwards audio to private Whisper server via VPC binding.
 * Falls back to a configured Gemini ASR endpoint when Whisper is unavailable.
 *
 * Portability: NO hard-coded backend URLs or keys. Configure via Worker env:
 *   - GEMINI_ASR_URL    (full URL to a gemini-asr edge function, optional)
 *   - GEMINI_ASR_KEY    (bearer token for that endpoint, optional)
 * If either is missing, falls back gracefully with a clear error envelope.
 */

import type { Env } from './index';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

async function callGeminiFallback(
  formData: FormData,
  reason: string,
  env: Env,
): Promise<Response> {
  console.log('[whisper-asr] Falling back to Gemini ASR. Reason:', reason);

  const geminiUrl = env.GEMINI_ASR_URL;
  if (!geminiUrl) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: '语音识别暂时不可用，请稍后重试',
        source: 'none',
        fallback: true,
        reason: `${reason}; gemini-url-missing`,
      }),
      { status: 200, headers: jsonHeaders },
    );
  }

  try {
    const headers: Record<string, string> = {};
    if (env.GEMINI_ASR_KEY) {
      headers['Authorization'] = `Bearer ${env.GEMINI_ASR_KEY}`;
      headers['apikey'] = env.GEMINI_ASR_KEY;
    }

    const res = await fetch(geminiUrl, { method: 'POST', headers, body: formData });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok || data?.ok === false) {
      console.error('[whisper-asr] Gemini fallback failed:', res.status, data);
      return new Response(
        JSON.stringify({
          ok: false,
          error: (data?.error as string) || '语音识别服务暂时不可用，请稍后重试',
          source: 'gemini',
          fallback: true,
          reason,
        }),
        { status: 200, headers: jsonHeaders },
      );
    }

    return new Response(
      JSON.stringify({ ...data, source: data.source || 'gemini', fallback: true, reason }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err) {
    console.error('[whisper-asr] Gemini fallback error:', err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: '语音识别服务连接失败，请检查网络',
        source: 'gemini',
        fallback: true,
        reason,
      }),
      { status: 200, headers: jsonHeaders },
    );
  }
}

export async function handleWhisperASR(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHeaders });
  }

  try {
    const contentType = request.headers.get('content-type') || '';

    // Health check (JSON ping) — never falls back, only reports Whisper status
    if (contentType.includes('application/json')) {
      try {
        const body = (await request.clone().json()) as { ping?: boolean };
        if (body.ping) {
          if (!env.WHISPER_VPC) {
            return new Response(JSON.stringify({ ok: false, status: 'unconfigured' }), { status: 503, headers: jsonHeaders });
          }
          try {
            const healthRes = await env.WHISPER_VPC.fetch('http://127.0.0.1/health');
            if (healthRes.ok) {
              return new Response(JSON.stringify({ ok: true, status: 'connected' }), { status: 200, headers: jsonHeaders });
            }
          } catch {
            /* fall through */
          }
          return new Response(JSON.stringify({ ok: false, status: 'unreachable' }), { status: 503, headers: jsonHeaders });
        }
      } catch {
        /* not a ping, continue */
      }
    }

    // Build a normalized FormData payload (used for both Whisper and the Gemini fallback)
    let formData: FormData;
    if (contentType.includes('multipart/form-data')) {
      const incomingForm = await request.formData();
      const file = incomingForm.get('file');

      formData = new FormData();
      if (file instanceof File) {
        const originalName = file.name || 'recording';
        const validExtensions = ['.flac', '.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.ogg', '.wav', '.webm', '.aac', '.opus'];
        const hasValidExt = validExtensions.some((ext) => originalName.toLowerCase().endsWith(ext));
        const fileName = hasValidExt ? originalName : 'recording.wav';
        const blob = new Blob([await file.arrayBuffer()], { type: file.type || 'audio/wav' });
        formData.append('file', blob, fileName);
      } else if (file) {
        const blob = new Blob([file as string], { type: 'audio/wav' });
        formData.append('file', blob, 'recording.wav');
      }
    } else {
      const audioBytes = await request.arrayBuffer();
      const blob = new Blob([audioBytes], { type: 'audio/webm' });
      formData = new FormData();
      formData.append('file', blob, 'recording.webm');
    }

    // No VPC binding configured → straight to Gemini
    if (!env.WHISPER_VPC) {
      return await callGeminiFallback(formData, 'whisper-vpc-missing', env);
    }

    // Try self-hosted Whisper first
    let response: Response;
    try {
      response = await env.WHISPER_VPC.fetch('http://127.0.0.1/v1/audio/transcriptions', {
        method: 'POST',
        body: formData,
      });
    } catch (err) {
      console.error('[whisper-asr] VPC fetch threw, falling back:', err);
      return await callGeminiFallback(formData, 'whisper-vpc-error', env);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('[whisper-asr] Whisper API error:', response.status, detail);
      return await callGeminiFallback(formData, `whisper-http-${response.status}`, env);
    }

    const data = await response.json().catch(() => null);
    if (!data || (typeof data === 'object' && (data as { ok?: boolean }).ok === false)) {
      console.error('[whisper-asr] Whisper returned error envelope, falling back:', data);
      return await callGeminiFallback(formData, 'whisper-error-envelope', env);
    }

    return new Response(JSON.stringify({ ...data, source: 'whisper' }), { status: 200, headers: jsonHeaders });
  } catch (err) {
    console.error('[whisper-asr] Unhandled error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: '语音识别服务连接失败，请检查网络', fallback: true }),
      { status: 200, headers: jsonHeaders },
    );
  }
}
