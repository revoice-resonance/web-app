/**
 * Cloudflare Worker: Resonance API Gateway
 * Routes /api/whisper-asr and /api/cosyvoice-tts to private GPU services via VPC bindings.
 */

import { handleWhisperASR } from './whisper-asr';
import { handleCosyVoiceTTS } from './cosyvoice-tts';
import { handleGeminiASR } from './gemini-asr';
import { handleCorpus } from './corpus';
import { handleClientLogs } from './client-logs';

export interface Env {
  WHISPER_VPC: Fetcher;
  COSYVOICE_VPC: Fetcher;
  ASSETS: Fetcher;
  /** Optional: full URL to a gemini-asr edge function for ASR fallback */
  GEMINI_ASR_URL?: string;
  /** Optional: bearer/apikey token for the GEMINI_ASR_URL endpoint */
  GEMINI_ASR_KEY?: string;
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/whisper-asr') {
        return await handleWhisperASR(request, env);
      }
      if (path === '/api/gemini-asr') {
        return await handleGeminiASR(request, env);
      }
      if (path === '/api/cosyvoice-tts') {
        return await handleCosyVoiceTTS(request, env);
      }
      if (path === '/api/corpus') {
        return await handleCorpus(request);
      }
      if (path === '/api/client-logs') {
        return await handleClientLogs(request);
      }
      // All other routes: serve static assets (SPA)
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error('[worker] Unhandled error:', err);
      return new Response(JSON.stringify({ ok: false, error: 'Internal error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
