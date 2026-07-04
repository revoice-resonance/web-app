/**
 * User voice HTTP handlers — CRUD and sync for cloned voice records.
 *
 * All endpoints require JWT auth (parse Cookie header → AuthService.getSession).
 * Voice data is stored via the StorageAdapter (PG or D1 depending on config).
 *
 * Exports:
 *   handleCreateVoice — POST /api/user/voices
 *   handleListVoices   — GET /api/user/voices
 *   handleSyncVoices   — POST /api/user/voices/sync
 */

import { AuthService } from '../services/AuthService';
import { createCorsResponse, createErrorResponse } from '../utils';
import { parseAuthCookie } from '../utils/cookie';
import { getStorageAdapter } from '../db/client';
import type { VoiceRecord } from '../db/adapter';
import type { Env } from '../types/env';

/** Map adapter camelCase VoiceRecord → snake_case API response shape. */
function toApiVoice(v: VoiceRecord): { voice_id: string; label: string | null; created_at: string } {
  return {
    voice_id: v.voiceId,
    label: v.label,
    created_at: v.createdAt,
  };
}

/** Extract userId from the JWT cookie, or null if unauthenticated. */
async function getUserId(request: Request, env: Env): Promise<string | null> {
  const token = parseAuthCookie(request);
  if (!token) return null;
  const adapter = getStorageAdapter(env);
  const auth = new AuthService(adapter, env.JWT_SECRET || 'dev-secret');
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
  const adapter = getStorageAdapter(env);

  try {
    const voice = await adapter.upsertVoice(userId, voiceId, label);
    return createCorsResponse({ ok: true, voice: toApiVoice(voice) }, 201);
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
  const adapter = getStorageAdapter(env);

  try {
    const voices = await adapter.listVoices(userId, limit, offset);
    const total = await adapter.countVoices(userId);

    return createCorsResponse({
      ok: true,
      voices: voices.map(toApiVoice),
      total,
      limit,
      offset,
    }, 200);
  } catch (err) {
    console.error('[user] listVoices error', err);
    return createCorsResponse(createErrorResponse('查询失败'), 500);
  }
}

/**
 * POST /api/user/voices/sync
 *
 * Batch upsert voices (e.g. from localStorage after login) and return the
 * merged complete list.
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

  const adapter = getStorageAdapter(env);

  try {
    const merged = await adapter.syncVoices(
      userId,
      voices.map(v => ({
        voiceId: v.voice_id,
        label: v.label?.trim() || null,
        createdAt: v.created_at,
      })),
    );

    return createCorsResponse({ ok: true, voices: merged.map(toApiVoice) }, 200);
  } catch (err) {
    console.error('[user] syncVoices error', err);
    return createCorsResponse(createErrorResponse('同步失败'), 500);
  }
}
