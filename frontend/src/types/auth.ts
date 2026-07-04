/**
 * Auth domain types — user identity, login flow, and API response contracts.
 *
 * Session authentication is cookie-based (JWT in HttpOnly cookie).
 * Guests can use all features without an account; voice data falls to
 * localStorage in that mode.
 */

// ---------------------------------------------------------------------------
// Auth state
// ---------------------------------------------------------------------------

/** High-level session status for routing decisions. */
export type AuthStatus = 'loading' | 'guest' | 'authenticated';

/** Full auth state surfaced by the useAuth hook. */
export interface AuthState {
  status: AuthStatus;
  /** Present only when authenticated. */
  userId?: string;
  /** Last 4 digits shown in UI; never the full phone number. */
  phone?: string;
}

// ---------------------------------------------------------------------------
// Login flow
// ---------------------------------------------------------------------------

/** Multi-step login wizard phases. */
export type LoginStep = 'phone' | 'code' | 'success';

// ---------------------------------------------------------------------------
// Auth API responses
// ---------------------------------------------------------------------------

/** POST /api/auth/send-code */
export interface SendCodeResponse {
  ok: boolean;
}

/** POST /api/auth/verify-code */
export interface VerifyCodeResponse {
  ok: boolean;
  userId: string;
}

/** GET /api/auth/session */
export interface SessionResponse {
  phone: string | null;
  userId: string | null;
  /** Whether SMS login is available. Absent = unknown (treat as available). false = SMS not configured, auto-anonymous possible. */
  smsAvailable?: boolean;
}

/** POST /api/auth/anonymous */
export interface AnonymousSessionResponse {
  ok: boolean;
  userId: string;
}

/** POST /api/auth/bind-phone */
export interface BindPhoneResponse {
  ok: boolean;
  userId: string;
}

// ---------------------------------------------------------------------------
// User voice types
// ---------------------------------------------------------------------------

/** A single cloned voice record returned by the server. */
export interface UserVoice {
  voice_id: string;
  label?: string | null;
  created_at: string;
}

/** POST /api/user/voices/sync — request body */
export interface SyncVoicesRequest {
  voices: { voice_id: string; label?: string; created_at: string }[];
}

/** POST /api/user/voices/sync — response body */
export interface SyncVoicesResponse {
  ok: boolean;
  voices: UserVoice[];
}

/** GET /api/user/voices — paginated response */
export interface VoicesListResponse {
  ok: boolean;
  voices: UserVoice[];
  total: number;
  limit: number;
  offset: number;
}

/** POST /api/user/voices — create response */
export interface CreateVoiceResponse {
  ok: boolean;
  voice: UserVoice;
}
