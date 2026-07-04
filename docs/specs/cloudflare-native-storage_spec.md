# Feature Spec: Cloudflare 原生存储 + 浏览器指纹回退

## Overview

当前用户系统仅支持 PostgreSQL/Hyperdrive（需付费）+ 阿里云 SMS。本次增加：

1. **适配器模式存储层** — PG 和 D1+KV 各自封装为 `StorageAdapter`，方言差异由适配器内部消化
2. **浏览器指纹匿名身份** — 未配置 SMS 时用 FingerprintJS 自动生成匿名用户，无需登录

## Requirements

### R1: 存储适配器模式

**User Story:** 部署者设置 `STORAGE_BACKEND=pg|d1`，Worker 自动选择对应适配器，上层代码无感知

**Acceptance Criteria:**
- AC1.1: 定义 `StorageAdapter` 接口（领域方法，非原始 SQL）：`upsertCode`, `getCode`, `deleteCode`, `countRecentRequests`, `upsertUser`, `upsertVoice`, `listVoices`, `countVoices`, `syncVoices`
- AC1.2: `PgAdapter` 实现 — 封装 PG 方言（`$N` 占位符, `ON CONFLICT`, `NOW() - INTERVAL`, `TIMESTAMPTZ`）
- AC1.3: `D1Adapter` 实现 — 封装 SQLite 方言（`?` 占位符, `INSERT OR REPLACE`, `datetime('now')`, `TEXT`）
- AC1.4: D1Adapter 构造时执行 `PRAGMA foreign_keys = ON`
- AC1.5: KV 命名空间 `RESONANCE_KV` 用于 rate-limit 计数（`rate:sms:{phone}`, `rate:ip:{ip}`, TTL 3600s）
- AC1.6: `getStorageAdapter(env)` 工厂函数，根据 `STORAGE_BACKEND` 返回对应适配器，默认 `"d1"`
- AC1.7: 现有 PG 路径功能完全不变 — PgAdapter 内部逻辑与当前 `AuthService` + `db/client.ts` 的 SQL 等价
- AC1.8: `AuthService` 构造函数改为 `(adapter: StorageAdapter, kv: KVNamespace | null, env: Env)` — 依赖注入

### R2: 浏览器指纹匿名身份

**User Story:** 未配置 SMS 时，用户打开 App → 前端自动获取 deviceId → 后端签发匿名 JWT → 用户无感知登录

**Acceptance Criteria:**
- AC2.1: 前端 `useDeviceId()` hook — 加载 `@fingerprintjs/fingerprintjs`，缓存 `visitorId` 到 `localStorage['resonance_device_id']`
- AC2.2: FingerprintJS 加载失败 → 回退到 `crypto.randomUUID()` 生成随机 deviceId
- AC2.3: `POST /api/auth/anonymous` — 接收 `{ deviceId }` → 签发匿名 JWT（`sub = "d_" + SHA256(deviceId + JWT_SECRET)`, 7天），Set-Cookie 同 verify-code
- AC2.4: `GET /api/auth/session` — 当检测到无 Cookie 但有 `X-Device-Id` header 时，自动调用 anonymous 逻辑 → 返回 session + Set-Cookie
- AC2.5: 配置了 SMS 时匿名端点仍然可用 — 用户可先匿名使用后绑定手机号
- AC2.6: `POST /api/auth/bind-phone` — 接收 `{ phone, code }` → 创建新 `userId = "u_" + SHA256(...)` → 迁移 voice 数据到新 userId → 删除旧匿名用户行 → 签发新 JWT
- AC2.7: 匿名 JWT 有效期缩短为 24h（减少 bind-phone 后旧 JWT 残留窗口）

### R3: 部署文档

**User Story:** 部署者无需阅读代码即可选择部署模式

**Acceptance Criteria:**
- AC3.1: `wrangler.jsonc` 包含 D1 database + KV namespace binding 示例（注释）
- AC3.2: `worker/.dev.vars.example` 包含 `STORAGE_BACKEND` 选项说明
- AC3.3: Worker 启动时检查选定 backend 的 binding 是否存在，缺失返回 503 + 明确错误信息

## Out of Scope
- phone → anonymous 方向数据合并
- CAPTCHA
- JWT 撤销列表（无状态 JWT 固有限制，记录在已知限制中）

## Known Limitations
- D1 冷启动首次查询延迟 100-500ms
- FingerprintJS 开源版 ~60% 唯一性；同硬件/软件设备共享 visitorId
- bind-phone 后旧匿名 JWT 在 24h 内仍有效，指向已迁移的 userId（无状态 JWT 无法撤销）
- 匿名用户清除浏览器数据 = 身份永久丢失

## Assumptions
- D1 免费层 5GB/50 亿行读取/月，足够 <10 万用户
- KV 免费层 10 万读/1 千写/天，足够 rate-limit
- `@fingerprintjs/fingerprintjs` v4 开源版可用

---

## Developer Documentation

### Architecture: Adapter Pattern

```
┌──────────────────────────────────────────────┐
│              AuthService                      │
│  (JWT, code gen, verify — storage-agnostic)  │
└──────────┬───────────────────────────────────┘
           │ depends on
┌──────────▼───────────────────────────────────┐
│          StorageAdapter (interface)           │
│  upsertCode, getCode, deleteCode,             │
│  countRecentRequests, upsertUser,             │
│  upsertVoice, listVoices, countVoices,        │
│  syncVoices                                   │
└──────────┬───────────────────────────────────┘
           │ implements
    ┌──────┴──────┐
    ▼             ▼
┌────────┐  ┌────────────┐
│PgAdapter│  │ D1Adapter  │
│ PG SQL  │  │SQLite SQL  │
│ $N,     │  │ ?,         │
│ ON CONF │  │ INSERT OR  │
│ LICT,   │  │ REPLACE,   │
│ TIMEST  │  │ datetime() │
│ AMPTZ   │  │ TEXT       │
└───┬─────┘  └─────┬──────┘
    │              │
    ▼              ▼
 Hyperdrive    D1Database
 (RESONANCE_DB) (RESONANCE_D1)
                    │
                    ▼
               KVNamespace
               (RESONANCE_KV)
             rate-limit counters
```

### StorageAdapter Interface

```typescript
// worker/src/db/adapter.ts

interface CodeRecord { phone: string; code: string; attempts: number; createdAt: string; }
interface RateCount { cnt: number; }
interface VoiceRecord { voiceId: string; label: string | null; createdAt: string; }

interface StorageAdapter {
  // verification_codes
  upsertCode(phone: string, code: string): Promise<void>;
  getCode(phone: string): Promise<CodeRecord | null>;
  deleteCode(phone: string): Promise<void>;

  // code_requests (rate limiting)
  countRecentRequests(phone: string, ip: string, windowMinutes: number): Promise<{ phoneCount: number; ipCount: number }>;
  insertCodeRequest(phone: string, ip: string): Promise<void>;

  // users
  upsertUser(userId: string, phoneHash?: string): Promise<void>;

  // user_voices
  upsertVoice(userId: string, voiceId: string, label: string | null): Promise<VoiceRecord>;
  listVoices(userId: string, limit: number, offset: number): Promise<VoiceRecord[]>;
  countVoices(userId: string): Promise<number>;
  syncVoices(userId: string, voices: Array<{ voiceId: string; label?: string | null; createdAt?: string }>): Promise<VoiceRecord[]>;
}
```

### D1 Schema (SQLite dialect)

```sql
-- D1 uses SQLite. Differences from PG:
--   - TEXT for timestamps (ISO-8601, lexicographic ordering works)
--   - INTEGER PRIMARY KEY AUTOINCREMENT instead of BIGSERIAL
--   - INSERT OR REPLACE / INSERT OR IGNORE instead of ON CONFLICT
--   - datetime('now') instead of NOW()
--   - ? placeholders instead of $1, $2

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS verification_codes (
    phone TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS code_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    ip TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cr_phone_ts ON code_requests(phone, created_at);
CREATE INDEX IF NOT EXISTS idx_cr_ip_ts ON code_requests(ip, created_at);

CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    phone_hash TEXT,  -- nullable for anonymous users
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_voices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(user_id),
    voice_id TEXT NOT NULL,
    label TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, voice_id)
);
CREATE INDEX IF NOT EXISTS idx_uv_user ON user_voices(user_id);
```

### KV Rate-Limit Keys

| Key Pattern | Value | TTL |
|-------------|-------|-----|
| `rate:sms:{phone}` | counter (int) | 3600s |
| `rate:ip:{ip}` | counter (int) | 3600s |

### Env Additions

```typescript
// worker/src/types/env.ts additions:
STORAGE_BACKEND?: 'pg' | 'd1';  // default 'd1'
RESONANCE_D1?: D1Database;      // D1 binding
RESONANCE_KV?: KVNamespace;     // KV binding for rate-limit
// RESONANCE_DB (Hyperdrive) kept for PG mode
```

### File Structure

```
worker/src/
  db/
    adapter.ts        ← NEW: StorageAdapter interface
    pg.ts             ← NEW: PgAdapter (refactored from current client.ts + AuthService SQL)
    d1.ts             ← NEW: D1Adapter (SQLite dialect + KV rate-limit)
    client.ts         ← MODIFIED: export getStorageAdapter(env) factory
    schema.sql        ← MODIFIED: phone_hash nullable for anonymous users
    schema.d1.sql     ← NEW: D1 reference schema
  services/
    AuthService.ts    ← MODIFIED: accept (adapter, kv, env) via DI
    SMSService.ts     ← unchanged
  handlers/
    auth.ts           ← MODIFIED: add anonymous + bind-phone, use factory
    user.ts           ← MODIFIED: use adapter instead of direct db/client
  types/
    env.ts            ← MODIFIED: add STORAGE_BACKEND, RESONANCE_D1, RESONANCE_KV
  index.ts            ← MODIFIED: register anonymous + bind-phone routes

frontend/src/
  hooks/
    useDeviceId.ts    ← NEW: FingerprintJS → visitorId (cached in localStorage)
    useAuth.ts        ← MODIFIED: auto-anonymous flow when no SMS configured
  pages/
    LoginPage.tsx     ← MODIFIED: auto-skip when anonymous mode available
  AppRoutes.tsx       ← MODIFIED: init deviceId before auth gate
```

### Implementation Steps

1. **Adapter interface** — `db/adapter.ts` with domain methods
2. **PgAdapter** — extract current SQL from AuthService + db/client into adapter methods
3. **D1Adapter** — implement same interface with SQLite dialect + KV rate-limit
4. **Factory** — `getStorageAdapter(env)` in db/client.ts
5. **AuthService refactor** — accept `(adapter, kv, env)`, use adapter methods
6. **Anonymous auth** — POST /api/auth/anonymous, GET /api/auth/session with X-Device-Id
7. **Bind phone** — POST /api/auth/bind-phone with voice migration
8. **Frontend deviceId** — useDeviceId hook
9. **Frontend auto-auth** — useAuth anonymous flow
10. **Deploy docs** — wrangler.jsonc, .dev.vars.example

### Edge-Case Mapping

| Edge Case | Handler |
|-----------|---------|
| FingerprintJS fails | Fallback to `crypto.randomUUID()` in localStorage |
| D1 binding missing when STORAGE_BACKEND=d1 | getStorageAdapter throws → handler returns 503 |
| KV binding missing | Rate-limit skipped (advisory only); warn log |
| Anonymous → phone upgrade | bind-phone: INSERT new user, migrate voices, DELETE old user, new JWT |
| Old anonymous JWT after bind | 24h window; returns 401 for deleted user → client re-auths |
| User clears browser data | New deviceId = new anonymous identity |
| Both SMS and D1 configured | SMS available, anonymous also available |
| PG phone_hash NOT NULL conflict | Migration: `ALTER TABLE users ALTER COLUMN phone_hash DROP NOT NULL` |

### Spec Traceability

| Req | ACs | Stories |
|-----|-----|---------|
| R1 (Adapter) | AC1.1-1.8 | Adapter Interface, PgAdapter, D1Adapter, Factory, AuthService Refactor |
| R2 (Fingerprint) | AC2.1-2.7 | useDeviceId, Anonymous Auth, Bind Phone, Auto-Auth |
| R3 (Docs) | AC3.1-3.3 | Deploy Configuration |
