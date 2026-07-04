/**
 * StorageAdapter — domain-level persistence interface for the auth system.
 *
 * Each method maps to a single database operation. Implementations
 * encapsulate their own SQL dialect (PostgreSQL vs SQLite/D1) so that
 * service-layer code never constructs raw SQL.
 *
 * Two implementations:
 *   PgAdapter  — Hyperdrive/PostgreSQL ($N placeholders, ON CONFLICT, TIMESTAMPTZ)
 *   D1Adapter  — D1Database/SQLite (? placeholders, INSERT OR REPLACE, TEXT)
 *
 * Rate-limiting is internal to each adapter (PG uses code_requests table,
 * D1 uses KV counters with TTL).  The fixed-window KV approach differs from
 * PG's sliding window — see Known Limitations in the spec.
 */

// ---------------------------------------------------------------------------
// Record types
// ---------------------------------------------------------------------------

export interface CodeRecord {
  phone: string;
  code: string;
  attempts: number;
  createdAt: string;
}

export interface UserRecord {
  userId: string;
  phoneHash: string | null;
  createdAt: string;
}

export interface VoiceRecord {
  voiceId: string;
  label: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// StorageAdapter
// ---------------------------------------------------------------------------

export interface StorageAdapter {
  // ── verification_codes ──────────────────────────────────────────

  /**
   * Insert or replace the verification code for a phone number.
   * `attempts` defaults to 0 when omitted (used by sendCode);
   * non-zero values are set atomically (used by verifyCode for
   * increment-after-wrong-code).
   */
  upsertCode(phone: string, code: string, attempts?: number): Promise<void>;

  /** Retrieve the active verification code record for a phone number. */
  getCode(phone: string): Promise<CodeRecord | null>;

  /** Remove the verification code row for a phone number. */
  deleteCode(phone: string): Promise<void>;

  /**
   * Clean up expired verification codes.
   * Called by sendCode before inserting a new code.
   * Each adapter decides the cleanup window internally.
   */
  cleanupExpiredCodes(): Promise<void>;

  // ── rate limiting (adapter-internal implementation) ──────────────

  /**
   * Count recent SMS send requests for a phone and IP within the given
   * time window (minutes).  PG uses code_requests table; D1 uses KV
   * counters with TTL (fixed-window, not sliding — see spec).
   */
  countRecentRequests(
    phone: string,
    ip: string,
    windowMinutes: number,
  ): Promise<{ phoneCount: number; ipCount: number }>;

  /** Record an SMS send request for rate-limit tracking. */
  recordCodeRequest(phone: string, ip: string): Promise<void>;

  // ── users ───────────────────────────────────────────────────────

  /** Look up a user by ID.  Returns null if not found. */
  getUser(userId: string): Promise<UserRecord | null>;

  /**
   * Create a user row if it does not already exist.
   * phoneHash is optional (null for anonymous users).
   * Conflict behaviour: DO NOTHING (does not overwrite existing).
   */
  upsertUser(userId: string, phoneHash?: string): Promise<void>;

  /** Delete a user row.  Used when upgrading anonymous → phone-bound. */
  deleteUser(userId: string): Promise<void>;

  // ── user_voices ─────────────────────────────────────────────────

  /**
   * Insert or update a cloned voice record.  Returns the stored row.
   * Optional createdAt preserves the original clone timestamp.
   */
  upsertVoice(
    userId: string,
    voiceId: string,
    label: string | null,
    createdAt?: string,
  ): Promise<VoiceRecord>;

  /** List cloned voices for a user with pagination. */
  listVoices(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<VoiceRecord[]>;

  /** Count total cloned voices for a user. */
  countVoices(userId: string): Promise<number>;

  /**
   * Batch-upsert voices (e.g. from localStorage after login) and
   * return the complete merged list.  Earliest created_at wins on
   * duplicate voice_id.
   */
  syncVoices(
    userId: string,
    voices: Array<{
      voiceId: string;
      label?: string | null;
      createdAt?: string;
    }>,
  ): Promise<VoiceRecord[]>;

  /** Delete a single voice record.  Used during bind-phone migration. */
  deleteVoice(userId: string, voiceId: string): Promise<void>;
}
