/**
 * Alibaba Cloud SMS REST client.
 *
 * Sends 6-digit verification codes via Alibaba Cloud SMS API (SendSms)
 * using HMAC-SHA256 request signing. Pure `fetch` + Web Crypto — no
 * third-party SDK dependency, matching the codebase's existing pattern
 * (see utils/s3-signer.ts for the same Web Crypto HMAC-SHA256 approach).
 *
 * Signature algorithm: Alibaba Cloud API v3 (AK/SK via Authorization header).
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Minimal SMS configuration — the subset of Env that sendSms needs.
 * Kept small so callers (AuthService) don't need the full Env object.
 */
export interface SmsConfig {
  ALIBABA_ACCESS_KEY_ID?: string;
  ALIBABA_ACCESS_KEY_SECRET?: string;
  ALIBABA_SMS_SIGN_NAME?: string;
  ALIBABA_SMS_TEMPLATE_CODE?: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SMS_API_HOST = 'dysmsapi.aliyuncs.com';
const SMS_API_PATH = '/';
const SMS_REGION = 'cn-hangzhou';
const SMS_SERVICE = 'dysmsapi';
const SMS_VERSION = '2017-05-25';

const FETCH_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a 6-digit verification code to the given phone number via
 * Alibaba Cloud SMS.
 *
 * @throws Error with a user-facing message on any failure.
 */
export async function sendSms(
  phone: string,
  code: string,
  config: SmsConfig,
): Promise<void> {
  const accessKeyId = config.ALIBABA_ACCESS_KEY_ID;
  const accessKeySecret = config.ALIBABA_ACCESS_KEY_SECRET;
  const signName = config.ALIBABA_SMS_SIGN_NAME;
  const templateCode = config.ALIBABA_SMS_TEMPLATE_CODE;

  if (!accessKeyId || !accessKeySecret || !signName || !templateCode) {
    throw new Error('短信服务未配置');
  }

  // Build query parameters (sorted for canonicalisation).
  const params = new URLSearchParams();
  params.set('AccessKeyId', accessKeyId);
  params.set('Action', 'SendSms');
  params.set('Format', 'JSON');
  params.set('PhoneNumbers', phone);
  params.set('SignName', signName);
  params.set('SignatureMethod', 'HMAC-SHA256');
  params.set('SignatureVersion', '1.0');
  params.set('TemplateCode', templateCode);
  params.set('TemplateParam', JSON.stringify({ code }));
  params.set('Timestamp', new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''));
  params.set('Version', SMS_VERSION);
  params.set('SignatureNonce', crypto.randomUUID());
  params.sort();

  // Build signature.
  const stringToSign = `POST&${encodeRfc3986('/')}&${encodeRfc3986(params.toString())}`;
  const signature = await hmacSha256Base64(accessKeySecret, stringToSign);

  params.set('Signature', signature);

  const url = `https://${SMS_API_HOST}/?${params.toString()}`;

  // --- Fetch ---
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('短信服务请求超时，请稍后重试');
    }
    throw new Error('短信服务暂不可用，请稍后重试');
  } finally {
    clearTimeout(timer);
  }

  const body = await response.text().catch(() => '');

  if (!response.ok) {
    throw new Error(`短信服务异常 (${response.status})`);
  }

  // Parse JSON response from Alibaba Cloud.
  let result: { Code?: string; Message?: string };
  try {
    result = JSON.parse(body);
  } catch {
    throw new Error('短信服务返回异常响应');
  }

  if (result.Code !== 'OK') {
    throw new Error(mapSmsError(result.Code || '', result.Message));
  }
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

/**
 * Map Alibaba Cloud SMS error codes to user-facing Chinese messages.
 * Unknown codes return a generic failure message — never leak internal API
 * error details to the client.
 */
function mapSmsError(code: string, message?: string): string {
  const known: Record<string, string> = {
    'isv.BUSINESS_LIMIT_CONTROL': '短信发送过于频繁，请稍后再试',
    'isv.MOBILE_NUMBER_ILLEGAL': '手机号格式错误',
    'isv.SMS_SIGNATURE_ILLEGAL': '短信服务配置错误',
    'isv.SMS_TEMPLATE_ILLEGAL': '短信服务配置错误',
    'isv.OUT_OF_SERVICE': '短信服务暂不可用',
    'isv.AMOUNT_NOT_ENOUGH': '短信服务余额不足',
  };

  if (known[code]) return known[code];

  // Credential-related codes — don't leak which credential is wrong.
  if (
    code.includes('InvalidAccessKeyId') ||
    code.includes('SignatureDoesNotMatch') ||
    code.includes('InvalidAccessKeySecret')
  ) {
    return '短信服务配置错误';
  }

  return '短信发送失败，请稍后重试';
}

// ---------------------------------------------------------------------------
// Signature helpers
// ---------------------------------------------------------------------------

/**
 * RFC 3986 percent-encoding for Alibaba Cloud signature canonicalisation.
 * Alibaba Cloud requires encoding specific characters that differ from
 * the standard `encodeURIComponent`.
 */
function encodeRfc3986(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
    .replace(/\+/g, '%20')
    .replace(/%7E/g, '~');
}

/**
 * HMAC-SHA256 the given data with the key, returning a base64-encoded
 * signature string as required by Alibaba Cloud API v1.
 */
async function hmacSha256Base64(
  secretKey: string,
  data: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(`${secretKey}&`);
  const dataBuf = encoder.encode(data);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    dataBuf,
  );

  // Convert ArrayBuffer → base64.
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
