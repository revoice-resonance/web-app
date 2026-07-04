/**
 * Cloudflare Pages Worker Proxy
 * Routes all requests to the main Worker
 */

export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Forward to the Cloudflare Worker
  const workerUrl = `https://project-resonance-api.workers.dev${url.pathname}${url.search}`;

  const response = await fetch(workerUrl, {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.body,
  });

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
