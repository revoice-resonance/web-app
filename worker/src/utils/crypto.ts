/**
 * Crypto helpers — SHA-256 hashing, JWT sign/verify, and base64url
 * encoding/decoding.  Pure Web Crypto API (no third-party JWT library).
 *
 * Exports:
 *   sha256Hex   — SHA-256 hash, returns hex string
 *   signJWT     — sign a JWT with HS256
 *   verifyJWT   — verify and decode a JWT
 *   b64url      — base64url encode
 *   fromB64url  — base64url decode
 */

export async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function signJWT(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds: number,
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds };

  const encoder = new TextEncoder();
  const headerB64 = b64url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = b64url(encoder.encode(JSON.stringify(fullPayload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));
  const sigB64 = b64url(new Uint8Array(sig));

  return `${signingInput}.${sigB64}`;
}

export async function verifyJWT(
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const encoder = new TextEncoder();
    const signingInput = `${parts[0]}.${parts[1]}`;

    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));
    const sigB64 = b64url(new Uint8Array(sig));

    if (sigB64 !== parts[2]) return null;

    const payloadJson = new TextDecoder().decode(fromB64url(parts[1]));
    const payload = JSON.parse(payloadJson);

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

export function b64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function fromB64url(str: string): Uint8Array {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}