/**
 * PgAdapter — PostgreSQL implementation of StorageAdapter via Cloudflare Hyperdrive.
 *
 * Wraps the existing query helpers from ./client to implement every method of the
 * StorageAdapter interface.  SQL is byte-identical to the current implementations in
 * AuthService (sendCode, verifyCode) and handlers/user.ts, ensuring zero behavioural
 * change for the existing PG code path.
 *
 * Constructor takes a Hyperdrive binding (env.RESONANCE_DB).  All SQL uses $N
 * placeholders, ON CONFLICT, NOW(), and TIMESTAMPTZ — PostgreSQL dialect.
 */

import { query, queryOne, execute } from './client';
import type { StorageAdapter, CodeRecord, UserRecord, VoiceRecord } from './adapter';

export class PgAdapter implements StorageAdapter {
  constructor(private db: Hyperdrive) {}

  // ── verification_codes ────────────────────────────────────────────────

  async upsertCode(phone: string, code: string, attempts: number = 0): Promise<void> {
    await execute(
      this.db,
      `INSERT INTO verification_codes (phone, code, attempts, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (phone) DO UPDATE SET code = $2, attempts = $3, created_at = NOW()`,
      [phone, code, attempts],
    );
  }

  async getCode(phone: string): Promise<CodeRecord | null> {
    const row = await queryOne(
      this.db,
      'SELECT code, attempts, created_at FROM verification_codes WHERE phone = $1',
      [phone],
    );
    if (!row) return null;
    return {
      phone,
      code: String(row.code),
      attempts: Number(row.attempts),
      createdAt: String(row.created_at),
    };
  }

  async deleteCode(phone: string): Promise<void> {
    await execute(
      this.db,
      'DELETE FROM verification_codes WHERE phone = $1',
      [phone],
    );
  }

  async cleanupExpiredCodes(): Promise<void> {
    await execute(
      this.db,
      "DELETE FROM verification_codes WHERE created_at < NOW() - INTERVAL '5 minutes'",
    );
  }

  // ── code_requests (rate limiting) ────────────────────────────────────

  async countRecentRequests(
    phone: string,
    ip: string,
    windowMinutes: number,
  ): Promise<{ phoneCount: number; ipCount: number }> {
    const phoneRow = await queryOne(
      this.db,
      `SELECT COUNT(*) as cnt FROM code_requests WHERE phone = $1 AND created_at > NOW() - ($2 * INTERVAL '1 minute')`,
      [phone, windowMinutes],
    );
    const ipRow = await queryOne(
      this.db,
      `SELECT COUNT(*) as cnt FROM code_requests WHERE ip = $1 AND created_at > NOW() - ($2 * INTERVAL '1 minute')`,
      [ip, windowMinutes],
    );
    return {
      phoneCount: phoneRow ? Number(phoneRow.cnt) : 0,
      ipCount: ipRow ? Number(ipRow.cnt) : 0,
    };
  }

  async recordCodeRequest(phone: string, ip: string): Promise<void> {
    await execute(
      this.db,
      'INSERT INTO code_requests (phone, ip, created_at) VALUES ($1, $2, NOW())',
      [phone, ip],
    );
  }

  // ── users ────────────────────────────────────────────────────────────

  async upsertUser(userId: string, phoneHash?: string): Promise<void> {
    await execute(
      this.db,
      `INSERT INTO users (user_id, phone_hash, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, phoneHash ?? null],
    );
  }

  async getUser(userId: string): Promise<UserRecord | null> {
    const row = await queryOne(
      this.db,
      'SELECT user_id, phone_hash, created_at FROM users WHERE user_id = $1',
      [userId],
    );
    if (!row) return null;
    return {
      userId: String(row.user_id),
      phoneHash: row.phone_hash != null ? String(row.phone_hash) : null,
      createdAt: String(row.created_at),
    };
  }

  async deleteUser(userId: string): Promise<void> {
    await execute(
      this.db,
      'DELETE FROM users WHERE user_id = $1',
      [userId],
    );
  }

  // ── user_voices ──────────────────────────────────────────────────────

  async upsertVoice(
    userId: string,
    voiceId: string,
    label: string | null,
    createdAt?: string,
  ): Promise<VoiceRecord> {
    await execute(
      this.db,
      `INSERT INTO user_voices (user_id, voice_id, label, created_at)
       VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()))
       ON CONFLICT (user_id, voice_id) DO UPDATE SET label = COALESCE($3, user_voices.label)`,
      [userId, voiceId, label, createdAt ?? null],
    );

    // Fetch the row to return created_at from the database
    const rows = await query(
      this.db,
      'SELECT voice_id, label, created_at FROM user_voices WHERE user_id = $1 AND voice_id = $2',
      [userId, voiceId],
    );

    const voice = rows[0] || {
      voice_id: voiceId,
      label,
      created_at: new Date().toISOString(),
    };
    return {
      voiceId: String(voice.voice_id),
      label: voice.label != null ? String(voice.label) : null,
      createdAt: String(voice.created_at),
    };
  }

  async listVoices(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<VoiceRecord[]> {
    const rows = await query(
      this.db,
      'SELECT voice_id, label, created_at FROM user_voices WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset],
    );
    return rows.map((r) => ({
      voiceId: String(r.voice_id),
      label: r.label != null ? String(r.label) : null,
      createdAt: String(r.created_at),
    }));
  }

  async countVoices(userId: string): Promise<number> {
    const rows = await query(
      this.db,
      'SELECT COUNT(*) as total FROM user_voices WHERE user_id = $1',
      [userId],
    );
    return rows[0] ? Number(rows[0].total) : 0;
  }

  async syncVoices(
    userId: string,
    voices: Array<{
      voiceId: string;
      label?: string | null;
      createdAt?: string;
    }>,
  ): Promise<VoiceRecord[]> {
    for (const v of voices) {
      if (!v.voiceId) continue;
      await execute(
        this.db,
        `INSERT INTO user_voices (user_id, voice_id, label, created_at)
         VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()))
         ON CONFLICT (user_id, voice_id) DO UPDATE SET
           label = COALESCE(EXCLUDED.label, user_voices.label),
           created_at = LEAST(user_voices.created_at, COALESCE(EXCLUDED.created_at, user_voices.created_at))`,
        [userId, v.voiceId, v.label?.trim() || null, v.createdAt || null],
      );
    }

    // Return the full merged list
    const merged = await query(
      this.db,
      'SELECT voice_id, label, created_at FROM user_voices WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );

    return merged.map((r) => ({
      voiceId: String(r.voice_id),
      label: r.label != null ? String(r.label) : null,
      createdAt: String(r.created_at),
    }));
  }

  async deleteVoice(userId: string, voiceId: string): Promise<void> {
    await execute(
      this.db,
      'DELETE FROM user_voices WHERE user_id = $1 AND voice_id = $2',
      [userId, voiceId],
    );
  }
}
