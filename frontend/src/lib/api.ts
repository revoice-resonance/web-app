/**
 * api.ts — typed API client module for the Resonance frontend.
 *
 * Thin wrapper around fetch() that provides:
 *  - Typed request parameters and response promises
 *  - Automatic `credentials: 'include'` on every request
 *  - Shared error handling: non-2xx responses throw a structured ApiError
 *  - Configurable retry (default 0 for mutations, 3 for queries)
 *
 * All hooks should import from this module instead of calling fetch() directly.
 */

// ===========================================================================
// API Error
// ===========================================================================

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// ===========================================================================
// Internal fetch wrapper
// ===========================================================================

interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | Record<string, unknown> | null;
  signal?: AbortSignal;
  /** Number of retry attempts on failure. Default: 0 for mutations, 3 for queries. */
  retries?: number;
}

/**
 * Core request function with retry, error handling, and credentials.
 *
 * On success returns the raw Response for the caller to parse.
 * On non-2xx throws an ApiError with the status code and parsed error body.
 * Retries only 5xx, 429, and network errors (not 4xx).
 */
async function request(url: string, options: FetchOptions = {}): Promise<Response> {
  const { retries, method, headers, body, signal } = options;
  const isGet = !method || method === 'GET';
  const maxRetries = retries ?? (isGet ? 3 : 0);

  // Serialise plain-object bodies to JSON and set Content-Type.
  let resolvedBody: BodyInit | null | undefined;
  let resolvedHeaders: HeadersInit | undefined = headers;

  if (
    body &&
    typeof body === 'object' &&
    !(body instanceof FormData) &&
    !(body instanceof Blob) &&
    !(body instanceof ArrayBuffer) &&
    !(body instanceof ReadableStream)
  ) {
    resolvedBody = JSON.stringify(body);
    resolvedHeaders = { 'Content-Type': 'application/json', ...(headers ?? {}) };
  } else {
    resolvedBody = body as BodyInit | null | undefined;
  }

  const fetchInit: RequestInit = {
    method,
    headers: resolvedHeaders,
    body: resolvedBody,
    signal,
    credentials: 'include',
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, fetchInit);

      if (!res.ok) {
        let errorBody: unknown;
        try {
          errorBody = await res.json();
        } catch {
          /* response body is not JSON */
        }
        const message =
          typeof errorBody === 'object' && errorBody !== null && 'error' in errorBody
            ? String((errorBody as { error: unknown }).error)
            : `Request failed with status ${res.status}`;
        throw new ApiError(message, res.status, errorBody);
      }

      return res;
    } catch (e) {
      lastError = e;

      if (e instanceof ApiError) {
        // Don't retry client errors (4xx) except 429 rate-limit.
        if (e.status >= 400 && e.status < 500 && e.status !== 429) {
          throw e;
        }
      }

      // Don't retry aborted requests.
      if (e instanceof DOMException && e.name === 'AbortError') {
        throw e;
      }

      if (attempt < maxRetries) {
        const delay = Math.min(1000 * 2 ** attempt, 10000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

// ===========================================================================
// Response types
// ===========================================================================

/** Response envelope used by most backend endpoints: { ok, data } */
export interface ResponseEnvelope<T> {
  ok: boolean;
  data: T;
}

/** GET /api/auth/session */
export interface SessionData {
  phone: string | null;
  userId: string | null;
  smsAvailable?: boolean;
}

/** POST /api/asr/recognize */
export interface ASRResult {
  data: Record<string, unknown>;
  status: number;
  statusText: string;
  requestId: string | null;
}

export interface ASRRequest {
  audio: string;
  mimeType: string;
  model: string;
  language: string;
  phrase_hints?: string[];
}

/** POST /api/tts/speak */
export interface TTSSpeakRequest {
  text: string;
  voice?: string;
  model?: string;
  speed?: number;
  volume?: number;
  response_format?: string;
  sample_rate?: number;
  instruction?: string;
}

/** POST /api/tts/voices/clone — voice registration response */
export interface CloneVoiceResponse {
  ok?: boolean;
  data?: { voice_id?: string };
  voice_id?: string;
  error?: string;
}

/** User voice record */
export interface UserVoiceData {
  voice_id: string;
  label?: string | null;
  created_at: string;
}

/** GET /api/user/voices */
export interface VoicesListResponse {
  ok: boolean;
  voices: UserVoiceData[];
  total?: number;
  limit?: number;
  offset?: number;
}

/** POST /api/user/voices */
export interface CreateVoiceResponse {
  ok: boolean;
  voice: UserVoiceData;
}

/** POST /api/user/voices/sync */
export interface SyncVoicesResponse {
  ok: boolean;
  voices: UserVoiceData[];
}

// ===========================================================================
// Public API client
// ===========================================================================

export const api = {
  // -----------------------------------------------------------------------
  // Auth
  // -----------------------------------------------------------------------
  auth: {
    /** GET /api/auth/session — check the current session cookie. */
    async getSession(headers?: Record<string, string>): Promise<ResponseEnvelope<SessionData>> {
      const res = await request('/api/auth/session', { headers });
      return res.json();
    },

    /** POST /api/auth/send-code — send SMS verification code. */
    async sendCode(phone: string): Promise<{ ok: boolean }> {
      const res = await request('/api/auth/send-code', {
        method: 'POST',
        body: { phone },
        retries: 0,
      });
      return res.json();
    },

    /** POST /api/auth/verify-code — verify SMS code and establish session. */
    async verifyCode(phone: string, code: string): Promise<{ ok: boolean; userId: string }> {
      const res = await request('/api/auth/verify-code', {
        method: 'POST',
        body: { phone, code },
        retries: 0,
      });
      return res.json();
    },

    /** POST /api/auth/logout — terminate the current session. */
    async logout(): Promise<void> {
      await request('/api/auth/logout', { method: 'POST', retries: 0 });
    },

    /** POST /api/auth/bind-phone — bind phone to an anonymous account. */
    async bindPhone(phone: string, code: string): Promise<{ ok: boolean; userId: string }> {
      const res = await request('/api/auth/bind-phone', {
        method: 'POST',
        body: { phone, code },
        retries: 0,
      });
      return res.json();
    },
  },

  // -----------------------------------------------------------------------
  // ASR
  // -----------------------------------------------------------------------
  asr: {
    /**
     * POST /api/asr/recognize — transcribe audio to text.
     *
     * Returns the parsed JSON body plus response metadata (status, headers)
     * so the hook can access request-id for diagnostics.
     * Retries: 0 (the hook manages its own retry loop with deadline).
     */
    async recognize(
      payload: ASRRequest,
      signal?: AbortSignal,
    ): Promise<ASRResult> {
      const res = await request('/api/asr/recognize', {
        method: 'POST',
        body: payload as unknown as Record<string, unknown>,
        signal,
        retries: 0,
      });
      const data = await res.json();
      return {
        data,
        status: res.status,
        statusText: res.statusText,
        requestId:
          res.headers.get('x-request-id') ??
          res.headers.get('x-supabase-request-id') ??
          null,
      };
    },
  },

  // -----------------------------------------------------------------------
  // TTS
  // -----------------------------------------------------------------------
  tts: {
    /**
     * POST /api/tts/speak — synthesise speech from text.
     * Returns the audio blob.
     */
    async speak(payload: TTSSpeakRequest, signal?: AbortSignal): Promise<Blob> {
      const res = await request('/api/tts/speak', {
        method: 'POST',
        body: payload as unknown as Record<string, unknown>,
        signal,
        retries: 0,
      });
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errBody?.error || '语音合成服务返回异常');
      }
      return res.blob();
    },

    /**
     * POST /api/tts/voices/clone — zero-shot TTS with prompt audio.
     * Sends FormData with tts_text, prompt_text, prompt_wav.
     * Returns the synthesised audio blob.
     */
    async speakWithCloneVoice(formData: FormData): Promise<Blob> {
      const res = await request('/api/tts/voices/clone', {
        method: 'POST',
        body: formData,
        retries: 0,
      });
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const errBody = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (errBody) {
          throw new Error(errBody.error || 'TTS 请求失败');
        }
        throw new Error('TTS 服务返回异常');
      }
      return res.blob();
    },

    /**
     * POST /api/tts/voices/clone — register a new voice from reference audio.
     * Sends FormData with audio and text fields.
     * Returns the parsed JSON response with voice_id.
     */
    async cloneVoice(formData: FormData): Promise<CloneVoiceResponse> {
      const res = await request('/api/tts/voices/clone', {
        method: 'POST',
        body: formData,
        retries: 0,
      });
      return res.json();
    },
  },

  // -----------------------------------------------------------------------
  // Corpus
  // -----------------------------------------------------------------------
  corpus: {
    /** POST /api/corpus — upload speech corpus sample. */
    async collect(formData: FormData): Promise<{ ok: boolean; file_name?: string }> {
      const res = await request(
        `${import.meta.env.VITE_WORKER_API_URL || ''}/api/corpus`,
        { method: 'POST', body: formData, retries: 0 },
      );
      return res.json();
    },
  },

  // -----------------------------------------------------------------------
  // User voices
  // -----------------------------------------------------------------------
  userVoices: {
    /** GET /api/user/voices?limit=N — list saved voices. */
    async list(limit = 50): Promise<VoicesListResponse> {
      const res = await request(`/api/user/voices?limit=${limit}`);
      return res.json();
    },

    /** POST /api/user/voices — save a cloned voice. */
    async create(voiceId: string, label?: string | null): Promise<CreateVoiceResponse> {
      const res = await request('/api/user/voices', {
        method: 'POST',
        body: { voice_id: voiceId, label: label || null },
        retries: 0,
      });
      return res.json();
    },

    /** POST /api/user/voices/sync — sync localStorage voices to server. */
    async sync(
      voices: { voice_id: string; label?: string | null; created_at: string }[],
    ): Promise<SyncVoicesResponse> {
      const res = await request('/api/user/voices/sync', {
        method: 'POST',
        body: { voices },
        retries: 0,
      });
      return res.json();
    },
  },
};