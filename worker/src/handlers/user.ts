/**
 * User voice HTTP handlers — CRUD and sync for cloned voice records.
 *
 * All endpoints require JWT auth (parse Cookie header → AuthService.getSession).
 * Voice data is stored in the user_voices table via Hyperdrive (parameterised SQL).
 *
 * Exports:
 *   handleCreateVoice — POST /api/user/voices
 *   handleListVoices   — GET /api/user/voices
 *   handleSyncVoices   — POST /api/user/voices/sync
 */

import { AuthService } from '../services/AuthService';
import { createCorsResponse, createErrorResponse } from '../utils';
import { parseAuthCookie } from '../utils/cookie';
import { query, execute } from '../db/client';
import type { Env } from '../types/env';

/** Extract userId from the JWT cookie, or null if unauthenticated. */
async function getUserId(request: Request, env: Env): Promise<string | null> {
  const token = parseAuthCookie(request);
  if (!token) return null;
  const auth = new AuthService(env);
  const session = await auth.getSession(token);
  return session?.userId ?? null;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * POST /api/user/voices
 *
 * Save or update a cloned voice for the authenticated user.
 * Uses ON CONFLICT to atomically upsert — no race condition on duplicate voice_id.
 */
export async function handleCreateVoice(request: Request, env: Env): Promise<Response> {
  const userId = await getUserId(request, env);
  if (!userId) {
    return createCorsResponse(createErrorResponse('未登录'), 401);
  }

  let body: { voice_id?: string; label?: string };
  try {
    body = (await request.json()) as { voice_id?: string; label?: string };
  } catch {
    return createCorsResponse(createErrorResponse('请求体必须是 JSON'), 400);
  }

  const voiceId = (body.voice_id || '').trim();
  if (!voiceId) {
    return createCorsResponse(createErrorResponse('voice_id 不能为空'), 400);
  }

  const label = body.label?.trim() || null;
  const db = env.RESONANCE_DB;

  try {
    await execute(db,
      `INSERT INTO user_voices (user_id, voice_id, label, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, voice_id) DO UPDATE SET label = COALESCE($3, user_voices.label)`,
      [userId, voiceId, label]);

    // Fetch the row to return created_at from the database
    const rows = await query(db,
      'SELECT voice_id, label, created_at FROM user_voices WHERE user_id = $1 AND voice_id = $2',
      [userId, voiceId]);

    const voice = rows[0] || { voice_id: voiceId, label, created_at: new Date().toISOString() };

    return createCorsResponse({ ok: true, voice }, 201);
  } catch (err) {
    console.error('[user] createVoice error', err);
    return createCorsResponse(createErrorResponse('保存失败'), 500);
  }
}

/**
 * GET /api/user/voices
 *
 * List the authenticated user's saved voices with pagination.
 * Query params: ?limit=20&offset=0 (max limit 50).
 */
export async function handleListVoices(request: Request, env: Env): Promise<Response> {
  const userId = await getUserId(request, env);
  if (!userId) {
    return createCorsResponse(createErrorResponse('未登录'), 401);
  }

  const url = new URL(request.url);
  const rawLimit = parseInt(url.searchParams.get('limit') || '20', 10);
  const limit = Math.min(Math.max(rawLimit || 20, 1), 50);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);
  const db = env.RESONANCE_DB;

  try {
    const voices = await query(db,
      'SELECT voice_id, label, created_at FROM user_voices WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset]);

    const countRow = await query(db,
      'SELECT COUNT(*) as total FROM user_voices WHERE user_id = $1',
      [userId]);
    const total = countRow[0] ? Number(countRow[0].total) : 0;

    return createCorsResponse({ ok: true, voices, total, limit, offset }, 200);
  } catch (err) {
    console.error('[user] listVoices error', err);
    return createCorsResponse(createErrorResponse('查询失败'), 500);
  }
}

/**
 * POST /api/user/voices/sync
 *
 * Batch upsert voices (e.g. from localStorage after login) and return the
 * merged complete list.  Uses LEAST() to preserve the earliest created_at
 * so the original clone timestamp survives dedup.
 */
export async function handleSyncVoices(request: Request, env: Env): Promise<Response> {
  const userId = await getUserId(request, env);
  if (!userId) {
    return createCorsResponse(createErrorResponse('未登录'), 401);
  }

  let body: { voices?: Array<{ voice_id: string; label?: string; created_at?: string }> };
  try {
    body = (await request.json()) as {
      voices?: Array<{ voice_id: string; label?: string; created_at?: string }>;
    };
  } catch {
    return createCorsResponse(createErrorResponse('请求体必须是 JSON'), 400);
  }

  const voices = body.voices;
  if (!Array.isArray(voices)) {
    return createCorsResponse(createErrorResponse('voices 必须是数组'), 400);
  }

  const db = env.RESONANCE_DB;

  try {
    for (const v of voices) {
      if (!v.voice_id) continue;
      await execute(db,
        `INSERT INTO user_voices (user_id, voice_id, label, created_at)
         VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()))
         ON CONFLICT (user_id, voice_id) DO UPDATE SET
           label = COALESCE(EXCLUDED.label, user_voices.label),
           created_at = LEAST(user_voices.created_at, COALESCE(EXCLUDED.created_at, user_voices.created_at))`,
        [userId, v.voice_id, v.label?.trim() || null, v.created_at || null]);
    }

    // Return the full merged list
    const merged = await query(db,
      'SELECT voice_id, label, created_at FROM user_voices WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]);

    return createCorsResponse({ ok: true, voices: merged }, 200);
  } catch (err) {
    console.error('[user] syncVoices error', err);
    return createCorsResponse(createErrorResponse('同步失败'), 500);
  }
}
