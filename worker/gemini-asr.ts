/**
 * Gemini ASR proxy — forwards audio FormData to a configured Gemini ASR
 * endpoint (typically a Supabase Edge Function), so the browser never has
 * to talk to it directly.
 *
 * Why route through the Worker:
 *   - In China, direct calls to *.supabase.co are flaky / blocked.
 *   - All API traffic must funnel through our same-origin Worker domain
 *     so it inherits the project's ICP-filed domain and stable connectivity.
 *
 * Configure via:
 *   wrangler secret put GEMINI_ASR_URL   # full URL of upstream gemini-asr fn
 *   wrangler secret put GEMINI_ASR_KEY   # bearer token (anon key)
 */

import type { Env } from './index';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

export async function handleGeminiASR(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  if (!env.GEMINI_ASR_URL) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Gemini ASR 未配置（请在 Worker 设置 GEMINI_ASR_URL）',
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

    // Pass-through the request body (multipart/form-data or raw audio)
    const upstream = await fetch(env.GEMINI_ASR_URL, {
      method: 'POST',
      headers: {
        ...headers,
        // Preserve original content-type so multipart boundaries survive
        ...(request.headers.get('content-type')
          ? { 'Content-Type': request.headers.get('content-type') as string }
          : {}),
      },
      body: request.body,
      // @ts-expect-error: duplex is required by Cloudflare Workers when streaming a body
      duplex: 'half',
    });

    const text = await upstream.text();
    return new Response(text, {
      status: 200,
      headers: {
        ...jsonHeaders,
        // Always 200 with structured envelope, never bubble upstream 5xx
      },
    });
  } catch (err) {
    console.error('[gemini-asr-proxy] Error:', err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Gemini ASR 代理失败',
        detail: String(err),
      }),
      { status: 200, headers: jsonHeaders },
    );
  }
}
