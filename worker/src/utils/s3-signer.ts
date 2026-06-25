export async function signS3Request(
  method: string,
  url: string,
  headers: Record<string, string>,
  payload: ArrayBuffer,
  accessKey: string,
  secretKey: string,
  region: string
): Promise<Record<string, string>> {
  const parsedUrl = new URL(url);
  const host = parsedUrl.host;
  const path = parsedUrl.pathname;
  const date = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const amzDate = date.replace(/\d{6}$/, '000000'); // Ensure format YYYYMMDDTHHMMSSZ
  const dateShort = amzDate.substring(0, 8);

  const encoder = new TextEncoder();

  // 1. Hash Payload
  const payloadHash = await crypto.subtle.digest('SHA-256', payload);
  const payloadHashHex = Array.from(new Uint8Array(payloadHash)).map(b => b.toString(16).padStart(2, '0')).join('');

  // 规范化：所有 header key 统一转小写，确保后续按小写 key 查找时能命中
  // （调用方传入的 'Content-Type' / 'Content-Length' / 'x-amz-meta-*' 原始大小写，
  //  若不规范化，下面 headers[k.toLowerCase()] 会拿到 undefined，.trim() 抛错）
  headers = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  headers['x-amz-content-sha256'] = payloadHashHex;
  headers['x-amz-date'] = amzDate;
  headers['host'] = host;

  // 2. Canonical Request
  const sortedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderNames.map(k => `${k}:${headers[k].trim()}`).join('\n');
  const signedHeaders = sortedHeaderNames.join(';');

  const canonicalRequest = [
    method.toUpperCase(),
    path,
    '', // Query string (empty for now)
    `${canonicalHeaders}\n`,
    signedHeaders,
    payloadHashHex
  ].join('\n');

  const canonicalRequestHash = await crypto.subtle.digest('SHA-256', encoder.encode(canonicalRequest));
  const canonicalRequestHashHex = Array.from(new Uint8Array(canonicalRequestHash)).map(b => b.toString(16).padStart(2, '0')).join('');

  // 3. String to Sign
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    `${dateShort}/${region}/s3/aws4_request`,
    canonicalRequestHashHex
  ].join('\n');

  // 4. Signing Key
  const secretKeyBytes = encoder.encode(`AWS4${secretKey}`);
  const kDate = await hmac(secretKeyBytes.buffer as ArrayBuffer, dateShort);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, 's3');
  const kSigning = await hmac(kService, 'aws4_request');

  // 5. Signature
  const signature = await hmac(kSigning, stringToSign);
  const signatureHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');

  // 6. Auth Header
  headers['Authorization'] = `AWS4-HMAC-SHA256 Credential=${accessKey}/${dateShort}/${region}/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signatureHex}`;

  return headers;
}

async function hmac(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}
