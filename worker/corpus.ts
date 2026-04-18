/**
 * Corpus collection proxy — forwards multipart upload to Tencent Cloud VPS.
 * Endpoint: POST /api/corpus
 */

const UPSTREAM = 'https://corpus.sg.superbrain-ai.com/api/corpus';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

export async function handleCorpus(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  try {
    // Stream the body straight through; preserve content-type (multipart boundary).
    const upstreamRes = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'content-type': request.headers.get('content-type') || 'application/octet-stream',
      },
      body: request.body,
    });

    const text = await upstreamRes.text();
    return new Response(text, {
      status: upstreamRes.status,
      headers: {
        ...corsHeaders,
        'Content-Type': upstreamRes.headers.get('content-type') || 'application/json',
      },
    });
  } catch (err) {
    console.error('[corpus] proxy error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: 'Corpus upstream unreachable' }),
      { status: 200, headers: jsonHeaders },
    );
  }
}
