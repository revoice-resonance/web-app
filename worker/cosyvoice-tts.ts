/**
 * CosyVoice TTS handler — FastAPI adapter via VPC binding.
 * Backend: server.py (FastAPI) exposing /inference_zero_shot etc.
 * Returns raw int16 PCM stream @ 24kHz mono → we wrap as WAV for the browser.
 */

import type { Env } from './index';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

function errorResponse(error: string, fallback = false, status = 200) {
  return new Response(JSON.stringify({ ok: false, error, fallback }), { status, headers: jsonHeaders });
}

const INTERNAL = 'http://127.0.0.1';
const SAMPLE_RATE = 24000; // CosyVoice3 output sample rate
const NUM_CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

/** Build a 44-byte RIFF/WAV header for int16 PCM data of given byte length */
function buildWavHeader(pcmByteLength: number): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const byteRate = SAMPLE_RATE * NUM_CHANNELS * (BITS_PER_SAMPLE / 8);
  const blockAlign = NUM_CHANNELS * (BITS_PER_SAMPLE / 8);

  // "RIFF"
  view.setUint8(0, 0x52); view.setUint8(1, 0x49); view.setUint8(2, 0x46); view.setUint8(3, 0x46);
  view.setUint32(4, 36 + pcmByteLength, true);
  // "WAVE"
  view.setUint8(8, 0x57); view.setUint8(9, 0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45);
  // "fmt "
  view.setUint8(12, 0x66); view.setUint8(13, 0x6d); view.setUint8(14, 0x74); view.setUint8(15, 0x20);
  view.setUint32(16, 16, true);            // PCM chunk size
  view.setUint16(20, 1, true);             // PCM format
  view.setUint16(22, NUM_CHANNELS, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  // "data"
  view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61);
  view.setUint32(40, pcmByteLength, true);
  return new Uint8Array(header);
}

export async function handleCosyVoiceTTS(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHeaders });
  }

  if (!env.COSYVOICE_VPC) {
    return errorResponse('语音合成服务未配置 VPC 绑定', true);
  }

  const vpc = env.COSYVOICE_VPC;

  try {
    const contentType = request.headers.get('content-type') || '';

    // Health check (JSON without prompt → not supported in zero-shot-only flow)
    if (!contentType.includes('multipart/form-data')) {
      const body = await request.json().catch(() => ({})) as any;
      if (body?.text) {
        return errorResponse('请先「存为音色」后再朗读，当前服务需要参考音频', true);
      }
      // health ping
      const ping = await vpc.fetch(`${INTERNAL}/health`).catch(() => null);
      if (ping?.ok) {
        return new Response(JSON.stringify({ ok: true, status: 'healthy' }), { status: 200, headers: jsonHeaders });
      }
      return errorResponse('TTS 服务不可达', true);
    }

    const formData = await request.formData();
    const ttsText = formData.get('tts_text') as string;
    const promptText = (formData.get('prompt_text') as string) || '';
    const promptWav = formData.get('prompt_wav') as File | null;

    if (!ttsText) return errorResponse("Missing 'tts_text'");
    if (!promptWav) return errorResponse('缺少参考音频 prompt_wav', true);

    // Validate RIFF/WAVE header before forwarding (FastAPI/soundfile will crash otherwise)
    const headerBuf = new Uint8Array(await promptWav.slice(0, 12).arrayBuffer());
    const riff = String.fromCharCode(headerBuf[0], headerBuf[1], headerBuf[2], headerBuf[3]);
    const wave = String.fromCharCode(headerBuf[8], headerBuf[9], headerBuf[10], headerBuf[11]);
    if (riff !== 'RIFF' || wave !== 'WAVE') {
      console.error('[cosyvoice-tts] invalid wav header, magic=', riff, wave, 'size=', promptWav.size);
      return errorResponse('参考音频不是有效的 WAV 格式，请在前端清除音色后重新录制', true);
    }

    // Forward to FastAPI /inference_zero_shot
    const upstreamForm = new FormData();
    upstreamForm.append('tts_text', ttsText);
    upstreamForm.append('prompt_text', promptText);
    upstreamForm.append('prompt_wav', promptWav, promptWav.name || 'prompt.wav');

    const upstream = await vpc.fetch(`${INTERNAL}/inference_zero_shot`, {
      method: 'POST',
      body: upstreamForm,
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      console.error('[cosyvoice-tts] upstream failed:', upstream.status, errText.substring(0, 1000));
      // Try to extract FastAPI's {detail: "..."} message
      let detail = errText.substring(0, 300);
      try {
        const j = JSON.parse(errText);
        if (j?.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
      } catch { /* not json */ }
      return errorResponse(`语音合成失败 (${upstream.status}): ${detail}`, true);
    }

    // Buffer raw PCM stream, then prepend WAV header.
    // (Workers can't easily mutate header length mid-stream, so we buffer.)
    const pcmBuf = new Uint8Array(await upstream.arrayBuffer());
    if (pcmBuf.length === 0) {
      return errorResponse('语音合成完成但音频为空', true);
    }

    const header = buildWavHeader(pcmBuf.length);
    const wav = new Uint8Array(header.length + pcmBuf.length);
    wav.set(header, 0);
    wav.set(pcmBuf, header.length);

    return new Response(wav, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/wav',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    console.error('[cosyvoice-tts] Error:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(`语音合成出错: ${msg}`, true);
  }
}
