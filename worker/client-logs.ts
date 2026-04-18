/**
 * Receives client diagnostic logs uploaded from the Settings page.
 *
 * Best-effort sink: logs are simply printed to the Worker's `wrangler tail`
 * stream so the dev/operator can grep for them. We deliberately do NOT
 * persist to a database here — keeps the surface tiny and PII-free.
 *
 * Always responds HTTP 200 with `{ ok, id }` so the client can confirm receipt
 * (per project's resilience rule: never return 500 from proxies).
 */

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

interface ClientLogPayload {
  ua?: string;
  url?: string;
  ts?: string;
  entries?: Array<{ ts: string; level: string; message: string }>;
}

export async function handleClientLogs(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Method not allowed' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  let payload: ClientLogPayload = {};
  try {
    payload = (await request.json()) as ClientLogPayload;
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: 'Invalid JSON body' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entries = Array.isArray(payload.entries) ? payload.entries.slice(-500) : [];

  // Emit a structured banner + each entry to `wrangler tail`.
  console.log(`[client-logs] ====== ${id} ======`);
  console.log(`[client-logs] meta`, JSON.stringify({
    ua: payload.ua,
    url: payload.url,
    ts: payload.ts,
    count: entries.length,
  }));
  for (const e of entries) {
    console.log(`[client-logs] [${e.level}] ${e.ts} ${e.message}`.slice(0, 2000));
  }
  console.log(`[client-logs] ====== end ${id} ======`);

  return new Response(
    JSON.stringify({ ok: true, id, received: entries.length }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
