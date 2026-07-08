# Feature Spec: 用户系统 & 功能恢复

## Overview

CosyVoice/Whisper 迁移后有两个遗留问题：(1) 训练/词表页面标记为"实验功能"不可用；(2) 无用户标识，数据无法跨设备持久化。本次构建基于手机号+SMS验证码的用户系统（PostgreSQL 存储，Worker 通过 VPC 访问），并将训练功能提升为正式导航。

## Requirements

### R1: 手机号验证码登录

**User Story:** 用户打开 App → 输入手机号 → 获取验证码 → 输入验证码 → 登录成功

**Acceptance Criteria:**
- AC1.1: 前端展示手机号输入框（中国大陆 11 位格式校验）+ "获取验证码"按钮
- AC1.2: 点击"获取验证码"后 60 秒内禁止重复点击（前端倒计时）；后端在 60 秒窗口内对同一手机号拒绝重复发送（幂等保护）
- AC1.3: Worker `POST /api/auth/send-code` 调用阿里云 SMS REST API 发送 6 位数字验证码；签名算法使用 HMAC-SHA256
- AC1.4: Worker `POST /api/auth/verify-code` 校验验证码 → 签发 JWT（HS256，7 天有效期），`Set-Cookie: HttpOnly; Secure; SameSite=Lax; Path=/api`
- AC1.5: 验证码存储于 PostgreSQL（`verification_codes` 表），5 分钟过期；单手机号每小时最多 5 次（`code_requests` 表计数）；单 IP 每小时最多 10 次 SMS 发送（防短信轰炸）
- AC1.6: 验证成功后跳转主页面；若已有有效 JWT cookie，`GET /api/auth/session` 返回 `{ phone, userId }` 且前端跳过登录页
- AC1.7: Worker `POST /api/auth/logout` 清除 cookie
- AC1.8: 无 Cookie 时所有端点仍可访问（guest 模式），仅在需要用户身份时降级到 localStorage
- AC1.9: `POST /api/auth/send-code` 和 `POST /api/auth/verify-code` 不向持久化存储写入除 `verification_codes`、`code_requests`、`users` 三张表之外的任何数据；不在日志中记录未脱敏手机号

**Edge Cases:**
- 无效手机号格式 → 前端正则即时拦截，不请求后端
- 验证码过期（>5 min）→ 后端返回 410，提示重新获取
- 验证码错误 3 次 → 该验证码立即失效（DB 行删除），需重新获取
- 60 秒内重复请求 → 后端返回 429 + `Retry-After` header
- 网络超时 → 前端展示"网络错误，请重试"
- SMS API 返回成功但用户未收到 → 60 秒后允许重发（"未收到验证码？" 按钮）

**Dependencies:** 阿里云 SMS REST API（Worker 直接用 `fetch` + HMAC-SHA256 签名，不引入 SDK）

### R3: 训练功能脱离"实验"状态，接入识别管线

**User Story:** 用户录音训练短语 → ASR 识别时，系统将匹配的训练短语作为 context hint 传给云端引擎，提升特定短语的识别准确率

**Acceptance Criteria:**
- AC3.1: 底部 Tab 导航增加"训练"入口（现有 ≤5 Tab）
- AC3.2: SettingsPage 移除"实验功能 - 暂未启用"折叠区；Phrases 和 Training 入口迁至主导航
- AC3.3: TrainingPage 和 PhrasesPage 移除所有"暂未启用"/"尚未接入识别管线"标签文案
- AC3.4: `useCloudASR.transcribe()` 接收可选 `phraseHints: string[]` 参数——来自用户已训练的短语文本列表
- AC3.5: Worker `POST /api/asr/recognize` 接收可选 `phrase_hints` 字段，透传给 Whisper ASR（若 API 支持）

**Note:** 若 Whisper ASR 不支持 phrase hints，`phraseHints` 参数保留为 no-op，但前端管线已就位。训练数据（短语+录音）保持在 localStorage——不收集到后端。

### R4: 用户音色同步

**User Story:** 登录后，克隆音色记录可跨设备持久化

**Acceptance Criteria:**
- AC4.1: 登录用户克隆成功后，voice_id 上报 `POST /api/user/voices`（关联 userId）存储到 PostgreSQL
- AC4.2: 登录后 `GET /api/user/voices` 拉取该用户历史克隆音色列表（上限 20 条；支持分页 `?limit=&offset=`）
- AC4.3: VoiceSelector 展示：用户已克隆音色（标记来源"我的"）+ 系统音色
- AC4.4: 未登录用户 VoiceClonePanel 正常工作；voice_id 仅存 localStorage，登录后通过 `POST /api/user/voices/sync` 一次性合并上传（服务端按 `voice_id` 去重）
- AC4.5: `POST /api/user/voices/sync` 接收 `{ voices: [{ voice_id, label?, created_at }] }` → 服务端去重后 upsert → 返回合并后的完整列表

### R6: 后端移除 501 旧路径

**User Story:** Worker 不暴露无功能旧 API 路径

**Acceptance Criteria:**
- AC6.1: 移除 Worker 路由注册：`POST /api/whisper-asr`（已重定向到 `/api/asr/recognize`）
- AC6.2: 移除 Worker 路由注册：`POST /api/tts/jobs`、`GET /api/tts/jobs/status`（已用 `/api/tts/speak` 替代）
- AC6.3: 移除 Worker 路由注册：`POST /api/tts/voice-clone`（已用 `/api/tts/voices/clone` 替代）
- AC6.4: 移除 Worker 路由注册：`POST /api/asr/jobs`、`GET /api/asr/jobs/status`（已用 `/api/asr/recognize` 替代）
- AC6.5: 清理 `Env` 类型中 `WHISPER_VPC`、`COSYVOICE_VPC`、`GEMINI_ASR_URL`、`GEMINI_ASR_KEY` 字段
- AC6.6: 移除 `ASRServiceImpl` 中 `tryWhisper()`、`tryGemini()`、`fallbackToGemini()` 方法及对应 healthCheck 逻辑
- AC6.7: 移除 `TTSServiceImpl` 中 `COSYVOICE_VPC` 相关逻辑（healthCheck、getAvailableVoices 等）
- AC6.8: 移除 `ServiceManager` 中 `healthCheck()` 和 `getServiceStats()` 的 VPC/Gemini 引用

## Out of Scope
- 语料收集（`POST /api/corpus` 保留路径但不被前端消费）
- Go 服务端恢复
- 微信小程序改动
- CAPTCHA / 人机验证（MVP 阶段以 IP 限流代替）
- JWT refresh token（7 天过期后重新 SMS 验证登录）

## Known Limitations
- `userId = "u_" + SHA256(phone + JWT_SECRET)` — 手机号变更 = 新用户 ID，旧音色记录不可访问。如需换号迁移，需后续做 phone-update flow
- `SameSite=Lax` 在跨站导航场景下不会发送 cookie（如从微信内置浏览器打开链接）；对于 Capacitor 原生 App 非问题，PWA 场景需验证
- 若 Worker 部署在与前端不同源的域名，需额外启用 `Access-Control-Allow-Credentials: true`

## Assumptions
- 阿里云 SMS 签名和模板已提前申请并获批（通常 1-3 个工作日；作为 Prerequisite Step）
- PostgreSQL 数据库已在 Cloudflare 控制台创建 Hyperdrive 绑定（连接字符串 + `RESONANCE_DB` binding 注入 Worker）
- Workers 付费计划（必须，Hyperdrive + VPC 需 Paid plan）
- JWT secret 通过 `wrangler secret put JWT_SECRET` 注入
- 阿里云 AK/SK 通过 `wrangler secret put ALIBABA_ACCESS_KEY_ID` / `ALIBABA_ACCESS_KEY_SECRET` 注入
- 用户总量 < 10 万，单表无分片即可

---

## Developer Documentation

### Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                    Frontend                       │
│  LoginPage ─► useAuth() ─► auth-aware hooks      │
│  VoiceSelector ─► useUserVoices()                 │
│  VoiceClonePanel ─► clone + persist + sync        │
│  BottomNav (+ Training tab)                        │
│  SettingsPage (no more "experimental" section)    │
└──────────────────┬──────────────────────────────┘
                   │ HTTP (cookie-based JWT, SameSite=Lax)
┌──────────────────▼──────────────────────────────┐
│              Cloudflare Worker                    │
│  ┌─────────────────────────────────────────┐     │
│  │ Auth: POST /api/auth/send-code           │     │
│  │       POST /api/auth/verify-code         │     │
│  │       GET  /api/auth/session             │     │
│  │       POST /api/auth/logout              │     │
│  ├─────────────────────────────────────────┤     │
│  │ User: POST /api/user/voices              │     │
│  │       GET  /api/user/voices              │     │
│  │       POST /api/user/voices/sync         │     │
│  ├─────────────────────────────────────────┤     │
│  │ Cloud: POST /api/asr/recognize           │ ◄── Whisper ASR │
│  │        GET  /api/asr/health              │     │
│  │        POST /api/tts/speak               │ ◄── CosyVoice TTS │
│  │        POST /api/tts/voices/clone        │     │
│  ├─────────────────────────────────────────┤     │
│  │ REMOVED routes:                          │     │
│  │  ✗ /api/whisper-asr   ✗ /api/tts/jobs  │     │
│  │  ✗ /api/tts/voice-clone ✗ /api/asr/jobs│     │
│  └─────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────┐     │
│  │ Middleware:                                │     │
│  │  - CORS (with Access-Control-Allow-Creds) │     │
│  │  - API_KEY guard (allowlists auth paths)   │     │
│  │  - JWT parser (attaches userId to ctx)    │     │
│  └─────────────────────────────────────────┘     │
└──────────┬──────────────┬────────────────────────┘
           │ VPC + Hyperdrive │ fetch
           ▼                  ▼
     PostgreSQL          CosyVoice/Whisper API
     (auth codes,       (ASR/TTS/Voice Clone)
      users, voices)
           │
           ▼
     Alibaba Cloud SMS API
     (HMAC-SHA256 signature,
      REST API via fetch)
```

### Database Schema (PostgreSQL)

```sql
-- verification_codes: 当前有效的验证码
CREATE TABLE verification_codes (
    phone      VARCHAR(20) PRIMARY KEY,
    code       VARCHAR(10) NOT NULL,
    attempts   INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 定期清理过期行 (cron / pg_cron): DELETE WHERE created_at < NOW() - INTERVAL '5 minutes'

-- code_requests: 发送频率限流
CREATE TABLE code_requests (
    phone      VARCHAR(20) NOT NULL,
    ip         VARCHAR(45) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_code_requests_phone_ts ON code_requests (phone, created_at);
CREATE INDEX idx_code_requests_ip_ts   ON code_requests (ip, created_at);

-- users: 用户主表
CREATE TABLE users (
    user_id    VARCHAR(80) PRIMARY KEY,  -- "u_" + SHA256(phone + JWT_SECRET)
    phone_hash VARCHAR(128) NOT NULL,    -- SHA256(phone + JWT_SECRET) (for potential lookup)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- user_voices: 用户克隆音色
CREATE TABLE user_voices (
    id         BIGSERIAL PRIMARY KEY,
    user_id    VARCHAR(80) NOT NULL REFERENCES users(user_id),
    voice_id   VARCHAR(100) NOT NULL,
    label      VARCHAR(100),            -- user-assigned display label
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, voice_id)
);
CREATE INDEX idx_user_voices_user ON user_voices (user_id);
```

### JWT Payload

```typescript
{
  sub: string;   // userId = "u_" + SHA256(phone + JWT_SECRET) — salted hash
  phone: string; // masked last 4 digits: "****1234"
  iat: number;
  exp: number;   // 7 days
}
```

### Cloudflare Worker Env

```typescript
// Existing
WHISPER_API_KEY: string;
COSYVOICE_API_KEY: string;
ALLOWED_ORIGIN?: string;

// New — Secrets (wrangler secret put)
JWT_SECRET: string;
ALIBABA_ACCESS_KEY_ID: string;
ALIBABA_ACCESS_KEY_SECRET: string;
ALIBABA_SMS_SIGN_NAME: string;
ALIBABA_SMS_TEMPLATE_CODE: string;

// New — Hyperdrive binding (wrangler.jsonc)
RESONANCE_DB: Hyperdrive;
```

### Worker route registration changes (index.ts)

```typescript
// REMOVED route registrations:
//   POST /api/whisper-asr
//   POST /api/asr/jobs, GET /api/asr/jobs/status
//   POST /api/tts/jobs, GET /api/tts/jobs/status
//   POST /api/tts/voice-clone

// NEW / MODIFIED route registrations:
//   POST /api/auth/send-code     — no API_KEY guard, no auth required
//   POST /api/auth/verify-code   — no API_KEY guard, no auth required
//   GET  /api/auth/session       — JWT optional
//   POST /api/auth/logout        — JWT optional
//   POST /api/user/voices        — JWT required
//   GET  /api/user/voices        — JWT required
//   POST /api/user/voices/sync   — JWT required

// API_KEY bypass for auth endpoints:
//   /api/auth/* → skip X-API-Key check (these are unauthenticated by design)
```

### File Structure

```
worker/src/
  handlers/
    auth.ts           ← NEW: send-code, verify-code, session, logout
    user.ts           ← NEW: save/get/sync user voice records
    cloudAsr.ts       ← modified: accept optional phrase_hints
    cloudTts.ts       ← unchanged
    voiceClone.ts     ← unchanged
    asr.ts            ← modified: remove whisper + job handlers (keep handleCorpusUploadRequest if used)
    tts.ts            ← modified: remove job/clone handlers
  services/
    SMSService.ts     ← NEW: Alibaba Cloud SMS REST client (HMAC-SHA256)
    AuthService.ts    ← NEW: code gen, verification, JWT sign/verify
  db/
    schema.sql        ← NEW: DDL as reference (actual migration via psql or wrangler)
    client.ts         ← NEW: PG query helper over Hyperdrive
  types/
    env.ts            ← modified: + new secrets + RESONANCE_DB, - VPC types
  index.ts            ← modified: + auth routes, + user routes, - legacy routes, + auth bypass for API_KEY guard

frontend/src/
  hooks/
    useAuth.ts        ← NEW: login, logout, session state, guest detection
    useUserVoices.ts  ← NEW: fetch/persist/sync cloned voices
  pages/
    LoginPage.tsx     ← NEW: phone input + code verify + countdown
  components/
    VoiceSelector.tsx ← modified: show user voices section + system voices
    VoiceClonePanel.tsx ← modified: persist on clone success (with auth)
    BottomNav.tsx     ← modified: + Training tab
    ASRStreamingResult.tsx ← unchanged (already clean in current codebase)
  types/
    auth.ts           ← NEW: AuthState, LoginStep, UserVoice
  AppRoutes.tsx       ← modified: auth gate, remove CosyVoice refs
```

### Implementation Steps

0. **Prerequisites** — Alibaba Cloud SMS template approved; Cloudflare Hyperdrive binding created; `wrangler secret put` all secrets; run DDL migration against PG
1. **Worker DB layer** — PG client helper over Hyperdrive, schema SQL reference
2. **Worker SMS service** — Alibaba Cloud SMS REST client with HMAC-SHA256 signing
3. **Worker auth service + endpoints** — code gen/verify, JWT sign/verify, rate limiting via PG
4. **Worker middleware** — JWT parser (attaches userId to request context), API_KEY bypass for /api/auth/*
5. **Worker user endpoints** — voice CRUD + sync
6. **Worker cleanup** — remove legacy routes, dead VPC/Gemini service code, dead types
7. **Frontend auth flow** — LoginPage + useAuth hook + AppRoutes auth gate
8. **Frontend training nav** — BottomNav training tab, remove experimental section from Settings
9. **Frontend voice sync** — VoiceSelector + VoiceClonePanel auth-aware with guest migration
10. **Integration** — end-to-end login → clone → sync across two browser tabs

### Edge-Case Mapping

| Edge Case | Handler |
|-----------|---------|
| Invalid phone format | LoginPage — client regex `/^1[3-9]\d{9}$/` |
| Code expired (>5 min) | AuthService.verifyCode() → DB row missing → 410 |
| Wrong code 3× | AuthService.verifyCode() → increment attempts, DELETE on 3rd → 403 |
| Rate limit (per-phone) | AuthService.sendCode() → `code_requests` count in 1h window → 429 |
| Rate limit (per-IP) | AuthService.sendCode() → `code_requests` count by IP in 1h window → 429 |
| Duplicate send <60s | AuthService.sendCode() → existing `verification_codes` row → 429 + Retry-After |
| Ali SMS API down | SMSService.sendSms() → 502 |
| JWT expired | JWT middleware → 401 → frontend redirects to login |
| No auth (guest) | All endpoints work sans cookie; voice data falls to localStorage |
| Guest login migration | POST /api/user/voices/sync with localStorage voices → PG upsert → clear localStorage |
| Phone change = new ID | userId derived from salted phone hash → no migration; documented limitation |
| Voice list >20 | GET /api/user/voices with ?limit=20&offset=N |

### Spec Traceability

| Req | Stories | Key Files |
|-----|---------|-----------|
| R1 (Auth) | SMS Service, Auth Endpoints, Login Page | `SMSService.ts`, `auth.ts`, `LoginPage.tsx`, `useAuth.ts` |
| R3 (Training Nav) | Nav Restructure, Phrase Hints | `BottomNav.tsx`, `SettingsPage.tsx`, `TrainingPage.tsx`, `PhrasesPage.tsx` |
| R4 (Voice Sync) | Voice Persistence, Guest Migration | `user.ts`, `useUserVoices.ts`, `VoiceSelector.tsx`, `VoiceClonePanel.tsx` |
| R6 (Backend Cleanup) | Legacy Route + Service Removal | `index.ts`, `asr.ts`, `tts.ts`, `env.ts`, `ASRService.ts`, `TTSService.ts`, `ServiceManager.ts` |
