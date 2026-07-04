/**
 * D1Adapter — SQLite/D1 implementation of StorageAdapter.
 *
 * Uses Cloudflare D1's native API (prepare().bind().run() / first()) with
 * SQLite dialect: ? placeholders, INSERT OR REPLACE, datetime('now'),
 * and TEXT columns for timestamps.
 *
 * Rate-limiting uses KV counters with TTL (fixed-window, not sliding).
 * If KV is null, rate-limit checks are skipped (return 0, warn).
 *
 * Constructor takes (db: D1Database, kv: KVNamespace | null).
 */

import type { StorageAdapter, CodeRecord, UserRecord, VoiceRecord } from './adapter';

// ---------------------------------------------------------------------------
// D1 result helpers
// ---------------------------------------------------------------------------

function rowValue(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (v === null || v === undefined) return '';
  return String(v);
}

function rowNumber(row: Record<string, unknown>, key: string): number {
  const v = row[key];
  if (v === null || v === undefined) return 0;
  return Number(v);
}

// ---------------------------------------------------------------------------
// D1Adapter
// ---------------------------------------------------------------------------

export class D1Adapter implements StorageAdapter {
  constructor(
    private db: D1Database,
    private kv: KVNamespace | null,
  ) {
    // Enable foreign key enforcement for this connection.
    void this.db.exec('PRAGMA foreign_keys = ON');
  }

  // ── verification_codes ────────────────────────────────────────────────

  async upsertCode(phone: string, code: string, attempts: number = 0): Promise<void> {
    await this.db
      .prepare(
        `INSERT OR REPLACE INTO verification_codes (phone, code, attempts, created_at)
         VALUES (?, ?, ?, datetime('now'))`,
      )
      .bind(phone, code, attempts)
      .run();
  }

  async getCode(phone: string): Promise<CodeRecord | null> {
    const row = await this.db
      .prepare('SELECT code, attempts, created_at FROM verification_codes WHERE phone = ?')
      .bind(phone)
      .first<Record<string, unknown>>();
    if (!row) return null;
    return {
      phone,
      code: rowValue(row, 'code'),
      attempts: rowNumber(row, 'attempts'),
      createdAt: rowValue(row, 'created_at'),
    };
  }

  async deleteCode(phone: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM verification_codes WHERE phone = ?')
      .bind(phone)
      .run();
  }

  async cleanupExpiredCodes(): Promise<void> {
    await this.db
      .prepare("DELETE FROM verification_codes WHERE created_at < datetime('now', '-5 minutes')")
      .run();
  }

  // ── rate limiting (KV counters with TTL) ──────────────────────────────

  async countRecentRequests(
    phone: string,
    ip: string,
    _windowMinutes: number,
  ): Promise<{ phoneCount: number; ipCount: number }> {
    if (!this.kv) {
      console.warn('[D1Adapter] countRecentRequests: KV not configured, skipping rate limit');
      return { phoneCount: 0, ipCount: 0 };
    }

    const phoneKey = `rate:sms:${phone}`;
    const ipKey = `rate:ip:${ip}`;

    const phoneVal = await this.kv.get(phoneKey);
    const ipVal = await this.kv.get(ipKey);

    return {
      phoneCount: phoneVal ? Number(phoneVal) : 0,
      ipCount: ipVal ? Number(ipVal) : 0,
    };
  }

  async recordCodeRequest(phone: string, ip: string): Promise<void> {
    if (!this.kv) {
      console.warn('[D1Adapter] recordCodeRequest: KV not configured, skipping');
      return;
    }

    const phoneKey = `rate:sms:${phone}`;
    const ipKey = `rate:ip:${ip}`;

    // Increment and set TTL.  KV doesn't have atomic increment, so we read→incr→write.
    const phoneVal = await this.kv.get(phoneKey);
    const ipVal = await this.kv.get(ipKey);

    await this.kv.put(phoneKey, String((phoneVal ? Number(phoneVal) : 0) + 1), { expirationTtl: 3600 });
    await this.kv.put(ipKey, String((ipVal ? Number(ipVal) : 0) + 1), { expirationTtl: 3600 });
  }

  // ── users ─────────────────────────────────────────────────────────────

  async getUser(userId: string): Promise<UserRecord | null> {
    const row = await this.db
      .prepare('SELECT user_id, phone_hash, created_at FROM users WHERE user_id = ?')
      .bind(userId)
      .first<Record<string, unknown>>();
    if (!row) return null;
    return {
      userId: rowValue(row, 'user_id'),
      phoneHash: rowValue(row, 'phone_hash') || null,
      createdAt: rowValue(row, 'created_at'),
    };
  }

  async upsertUser(userId: string, phoneHash?: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO users (user_id, phone_hash, created_at)
         VALUES (?, ?, datetime('now'))`,
      )
      .bind(userId, phoneHash ?? null)
      .run();
  }

  async deleteUser(userId: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM users WHERE user_id = ?')
      .bind(userId)
      .run();
  }

  // ── user_voices ───────────────────────────────────────────────────────

  async upsertVoice(
    userId: string,
    voiceId: string,
    label: string | null,
    createdAt?: string,
  ): Promise<VoiceRecord> {
    await this.db
      .prepare(
        `INSERT OR REPLACE INTO user_voices (user_id, voice_id, label, created_at)
         VALUES (?, ?, ?, COALESCE(?, datetime('now')))`,
      )
      .bind(userId, voiceId, label, createdAt ?? null)
      .run();

    // Fetch the row to return created_at from the database
    const row = await this.db
      .prepare('SELECT voice_id, label, created_at FROM user_voices WHERE user_id = ? AND voice_id = ?')
      .bind(userId, voiceId)
      .first<Record<string, unknown>>();

    return {
      voiceId: row ? rowValue(row, 'voice_id') : voiceId,
      label: row && row.label != null ? rowValue(row, 'label') : label,
      createdAt: row ? rowValue(row, 'created_at') : new Date().toISOString(),
    };
  }

  async listVoices(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<VoiceRecord[]> {
    const result = await this.db
      .prepare(
        'SELECT voice_id, label, created_at FROM user_voices WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      )
      .bind(userId, limit, offset)
      .run();

    return (result.results || []).map((r: Record<string, unknown>) => ({
      voiceId: rowValue(r, 'voice_id'),
      label: r.label != null ? rowValue(r, 'label') : null,
      createdAt: rowValue(r, 'created_at'),
    }));
  }

  async countVoices(userId: string): Promise<number> {
    const row = await this.db
      .prepare('SELECT COUNT(*) as total FROM user_voices WHERE user_id = ?')
      .bind(userId)
      .first<Record<string, unknown>>();
    return row ? rowNumber(row, 'total') : 0;
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
      await this.db
        .prepare(
          `INSERT OR REPLACE INTO user_voices (user_id, voice_id, label, created_at)
           VALUES (?, ?, ?, COALESCE(?, datetime('now')))`,
        )
        .bind(userId, v.voiceId, v.label?.trim() || null, v.createdAt || null)
        .run();
    }

    // Return the full merged list
    const result = await this.db
      .prepare(
        'SELECT voice_id, label, created_at FROM user_voices WHERE user_id = ? ORDER BY created_at DESC',
      )
      .bind(userId)
      .run();

    return (result.results || []).map((r: Record<string, unknown>) => ({
      voiceId: rowValue(r, 'voice_id'),
      label: r.label != null ? rowValue(r, 'label') : null,
      createdAt: rowValue(r, 'created_at'),
    }));
  }

  async deleteVoice(userId: string, voiceId: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM user_voices WHERE user_id = ? AND voice_id = ?')
      .bind(userId, voiceId)
      .run();
  }
}
