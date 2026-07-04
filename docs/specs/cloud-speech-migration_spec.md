# Specification: CloudSpeech Migration -- ASR & TTS Backend

> 中文注释为主，英文技术术语保留。

## Overview

将项目 "Resonance" 的语音转文字（ASR）和文字转语音（TTS）后端统一迁移到阶跃星辰（CloudSpeech）平台。

**现状：**
- ASR 使用 Whisper（mock，Worker 返回 501，前端自动降级到浏览器 Web Speech API）
- TTS 已有两条通路：CosyVoice（mock，Worker 返回 501）和 CloudSpeech（已实现并工作，`POST /api/tts/cloud-speech`）。CloudSpeech TTS 已通过 `useCloudSpeechTTS` hook 在 `Index.tsx` 中作为主朗读通路（`cloud-speech.speak` / `cloud-speech.stop`）。

**目标：**
- ASR：新增 CloudSpeech SSE 转发端点 `POST /api/asr/cloud-speech`，作为主识别引擎。前端回退链简化为 2 层：CloudSpeech → 浏览器。
- TTS：CloudSpeech 提升为主通路（已部分完成——Index.tsx 已连线），CosyVoice 音色克隆替换为 CloudSpeech 音色选择（系统音色 + 自定义音色 ID）。
- 旧通路（Whisper、Gemini ASR、CosyVoice TTS）保留端点但标记 deprecated（返回 501 + Deprecation header），不删除已有代码，确保向后兼容。

**Why CloudSpeech：**
- 单一供应商简化 API Key 管理（TTS 和 ASR 复用同一 `CLOUD_SPEECH_API_KEY`）
- 已在中国市场验证的延迟表现（ASR: 5 分钟音频 1 秒内识别）
- 丰富的音色库（9 种系统音色 + 自定义音色 ID）替代 CosyVoice 零样本克隆

**Scope：** 全栈变更 —— Worker（Cloudflare Worker 代理层）和 Frontend（React/TypeScript）。

---

## Requirements

### Backend Requirements (Worker Lane)

### R1: CloudSpeech ASR Proxy Endpoint
**Description:** 新增 `POST /api/asr/cloud-speech` 端点，接收前端 base64 音频，转发到 CloudSpeech SSE ASR API，聚合 SSE 文本流并以 JSON 返回完整转录结果。

**User Story:** As a frontend developer, I want a single endpoint that accepts audio and returns transcribed text via CloudSpeech, so that the user gets fast, accurate Chinese speech recognition.

**Acceptance Criteria:**
- [ ] AC1.1: `POST /api/asr/cloud-speech` accepts JSON body `{ audio: "<base64_string>", mimeType?: string, model?: string, language?: string }` where `mimeType` is the audio blob's MIME type (e.g. `"audio/webm"`, `"audio/mp4"`) used to construct the CloudSpeech format block
- [ ] AC1.2: Validates audio field is present and non-empty base64 string
- [ ] AC1.3: Calls `POST https://api.cloud-speech.com/v1/audio/asr/sse` with correct `Authorization: Bearer <CLOUD_SPEECH_API_KEY>` header
- [ ] AC1.4: Parses the SSE stream (`data: {"event":"result","data":"..."}\n\n`), extracts transcript text from each `result` event
- [ ] AC1.5: Returns JSON `{ ok: true, data: { text: "<full transcript>", model: "stepaudio-2.5-asr", elapsed_ms: <ms> } }` on success
- [ ] AC1.6: Returns structured JSON error `{ ok: false, error: "<message>" }` with appropriate HTTP status on failure (400/401/429/502/503)
- [ ] AC1.7: Requires `CLOUD_SPEECH_API_KEY` env var; returns 503 if missing
- [ ] AC1.8: Logs each request: model, audio size, elapsed time, success/failure

**Edge Cases:**
- Empty audio payload → 400
- Audio > CloudSpeech limit (base64 string very large) → 400 with "audio too large" message
- CloudSpeech SSE returns 0 `result` events → treat as empty recognition, return empty text
- SSE connection drops mid-stream → return partial text with a diagnostic note
- CloudSpeech API returns non-200 status → map to appropriate Worker response (401→503, 429→429, others→502)
- Network timeout to CloudSpeech → 502 with timeout message

### R2: CloudSpeech ASR Configuration & Health Check
**Description:** Worker 环境变量复用现有 `CLOUD_SPEECH_API_KEY`，无需新增 API Key。可选覆盖默认 model 和 base URL。新增专用健康检查端点供前端 CloudSpeech 状态检测使用。

**Acceptance Criteria:**
- [ ] AC2.1: CloudSpeech ASR reuses `CLOUD_SPEECH_API_KEY` from env (same key as TTS)
- [ ] AC2.2: Optional `CLOUD_SPEECH_ASR_DEFAULT_MODEL` env var for default ASR model (default: `stepaudio-2.5-asr`)
- [ ] AC2.3: `CLOUD_SPEECH_BASE_URL` works for both TTS and ASR endpoints
- [ ] AC2.4: Without `CLOUD_SPEECH_API_KEY`, endpoint returns 503 with clear message
- [ ] AC2.5: `GET /api/cloud-speech/health` returns `{ ok: true, provider: "cloud-speech" }` (200) when `CLOUD_SPEECH_API_KEY` is configured; returns `{ ok: false }` (503) when key is missing. This is a minimal key-presence check — it does NOT send a probe request to CloudSpeech's API.

**Edge Cases:**
- Key rotation: same env var, both TTS and ASR pick up change immediately

### R3: Deprecate Whisper/Gemini ASR Endpoints
**Description:** 现有 `/api/whisper-asr` 和 `/api/asr/jobs` 保持不变但标记 deprecated。

**Acceptance Criteria:**
- [ ] AC3.1: `/api/whisper-asr` continues returning 501 with existing message, adds `Deprecation: true` response header
- [ ] AC3.2: `/api/asr/jobs` (async job submit) continues working but adds `Deprecation` header
- [ ] AC3.3: No code is deleted -- handler files stay intact

### R4: CloudSpeech TTS Endpoint (Existing -- Document Only)
**Description:** 确认现有 `POST /api/tts/cloud-speech` 端点为 CloudSpeech TTS 的唯一工作通路。

**Acceptance Criteria:**
- [ ] AC4.1: `POST /api/tts/cloud-speech` works as currently implemented (validated by existing useCloudSpeechTTS hook)
- [ ] AC4.2: Existing CosyVoice endpoints (`/api/tts/jobs`, `/api/tts/voice-clone`) add `Deprecation` header
- [ ] AC4.3: TTS endpoint returns correct Content-Type per response_format (audio/mpeg, audio/wav, etc.)

### Frontend Requirements (React Lane)

### R5: CloudSpeech ASR Engine Type
**Description:** 在 ASR engine 类型系统中新增 `'cloud-speech'` 引擎。

**User Story:** As a user, I want to see "CloudSpeech" as an available speech recognition engine option with clear labeling.

**Acceptance Criteria:**
- [ ] AC5.1: `asrEngine.ts` type `ASREngine` extended: `'cloud-speech' | 'browser'` (removes `'whisper' | 'gemini'`)
- [ ] AC5.2: `asrEngine.ts` type `ASREngineStage` simplified to: `'idle' | 'cloud-speech-trying' | 'browser-trying' | 'success' | 'failed'`
- [ ] AC5.3: `useASREnginePreference.ts` type extended: `'auto' | 'cloud-speech' | 'browser'`
- [ ] AC5.4: `types/index.ts` `ASRSettings.provider` updated: `'cloud-speech' | 'browser'`
- [ ] AC5.5: TypeScript compilation passes with zero errors (`npm run typecheck`)

**Edge Cases:**
- Migration path for existing localStorage preference: if stored value is `'whisper'` or `'gemini'`, reset to `'auto'`

### R6: useCloudSpeechASR Hook
**Description:** 新建 `useCloudSpeechASR.ts`，替代 `useWhisperASR.ts` 作为主识别 hook。发送 base64 音频到 `/api/asr/cloud-speech`，实现 2 层回退：CloudSpeech → Browser。

**User Story:** As a user, I want my recorded speech to be transcribed accurately via CloudSpeech, with automatic fallback to browser recognition if CloudSpeech is unavailable.

**Acceptance Criteria:**
- [ ] AC6.1: Hook reads audio blob, captures its MIME type via `blob.type`, converts to base64 (via FileReader), sends `POST /api/asr/cloud-speech` with `{ audio, mimeType, model?, language? }`
- [ ] AC6.2: Implements retry logic: max 2 retries (3 total attempts), with exponential backoff + jitter (same pattern as useWhisperASR). base64 encoding is computed once before the retry loop (not re-encoded per attempt) since the audio blob doesn't change.
- [ ] AC6.3: Retryable errors: 5xx, 429, network errors. Non-retryable: 400, 401, 413.
- [ ] AC6.4: On all CloudSpeech retries exhausted, auto-fallback to browser Web Speech API (same `browserSpeechFallback()` logic from useWhisperASR)
- [ ] AC6.5: Return signature compatible with current useWhisperASR: `{ finalText, isProcessing, error: ASRError | null, transcribe, reset }`
- [ ] AC6.6: Follows same `ASRError` patterns (buildASRError, emitTelemetry, statusToErrorCode)
- [ ] AC6.7: Handles empty recognition result from CloudSpeech gracefully (shows appropriate user message)
- [ ] AC6.8: Respects total deadline of 25s, per-request timeout of 15s

**Edge Cases:**
- Audio blob is null/empty → return null immediately, no network request
- base64 conversion fails → set error with `BAD_REQUEST` code
- CloudSpeech returns empty text in valid JSON response → show "未能识别到语音内容"
- Browser fallback unsupported (old browsers) → show `ALL_FAILED` error
- Network offline detected → show `NETWORK_OFFLINE` error immediately, skip retries

### R7: ASREngineIndicator Update
**Description:** 更新 `ASREngineIndicator.tsx`，从 3 层显示改为 2 层（CloudSpeech → 浏览器），移除 Whisper/Gemini 层。

**User Story:** As a user, I want to see a clean 2-stage progress indicator showing which recognition engine is active.

**Acceptance Criteria:**
- [ ] AC7.1: Shows 2 stages: CloudSpeech → 浏览器 (browser)
- [ ] AC7.2: Each stage shows: pending (灰色) → active (蓝色脉冲) → done (绿色 check) → failed (红色删除线)
- [ ] AC7.3: When CloudSpeech succeeds, browser layer shown as "skipped"
- [ ] AC7.4: Stage labels are Chinese: "阶跃星辰" / "浏览器"
- [ ] AC7.5: Hides entirely when stage is 'idle'

### R8: ASREngineSelector Update
**Description:** 更新 `ASREngineSelector.tsx` 选项列表。

**Acceptance Criteria:**
- [ ] AC8.1: Options changed to: 智能 (auto), CloudSpeech (cloud-speech), 浏览器 (browser)
- [ ] AC8.2: Remove Whisper and Gemini options
- [ ] AC8.3: Auto mode hint text: "CloudSpeech → 浏览器，自动回退"
- [ ] AC8.4: Component still uses 3 options in radiogroup

### R9: ASREngineCard Update
**Description:** 更新 `ASREngineCard.tsx`，显示 2+1=3 个选项（auto, cloud-speech, browser），移除 Whisper/Gemini。

**Acceptance Criteria:**
- [ ] AC9.1: 3 engine cards: 智能模式 (auto), 阶跃星辰 (cloud-speech), 浏览器内置 (browser)
- [ ] AC9.2: CloudSpeech card description: "阶跃星辰 ASR，快速准确"
- [ ] AC9.3: Health check tests CloudSpeech API key availability via `GET /api/cloud-speech/health` (see R2 AC2.5). This is a lightweight key-presence check — it does NOT send fake audio to the ASR endpoint. The existing Whisper health check is removed. The card shows "CloudSpeech 已配置" when the Worker returns `{ ok: true }` (200, key present), "CloudSpeech 待配置" when Worker returns `{ ok: false }` (503, key missing).
- [ ] AC9.4: Remove Whisper backend health check entirely

### R10: TTS Primary -- CloudSpeech by Default
**Description:** 将 CloudSpeech TTS 设为主合成通路。**Index.tsx 已通过 `useCloudSpeechTTS` hook 完成核心连线**（`cloud-speech.speak` / `cloud-speech.stop` 作为 `UsagePage` 的 `onSpeak` / `onStop`）。此需求剩余工作为确认连线完整性并补充尚未覆盖的 UI 元素。

> **Already Implemented (pre-existing):** `frontend/src/pages/Index.tsx` wires `useCloudSpeechTTS({ voice: 'wenrounvsheng' })` as the primary TTS engine. `UsagePage` receives `onSpeak={cloud-speech.speak}`, `onStop={cloud-speech.stop}`, `isSpeaking={cloud-speech.isSpeaking}`, and `ttsError={cloud-speech.error}`. The "复述" and "朗读" buttons throughout `UsagePage` already route through CloudSpeech TTS.

**User Story:** As a user, I want high-quality Chinese speech synthesis via CloudSpeech when I tap "复述" or "朗读".

**Acceptance Criteria:**
- [x] AC10.1: `UsagePage` passes CloudSpeech TTS `speak`/`stop` to `TTSButton` and `ASRStreamingResult` — **Already Implemented** (`Index.tsx:14-22` wires `cloud-speech.speak` → `onSpeak`, `cloud-speech.stop` → `onStop`)
- [ ] AC10.2: Confirm `ASRStreamingResult` "朗读" button uses CloudSpeech TTS via the existing `onSpeak` prop chain (verify end-to-end, no code change expected)
- [ ] AC10.3: Browser TTS (`useTTS`) remains available as secondary option in Settings page — **already true, confirm unchanged**
- [ ] AC10.4: CloudSpeech TTS error messages displayed to user — **already wired** via `ttsError={cloud-speech.error}` in `Index.tsx:19`, confirm propagation
- [x] AC10.5: "复述" button uses CloudSpeech TTS by default — **Already Implemented** (same prop chain as AC10.1)

### R11: Voice Selection Replaces Voice Cloning
**Description:** 替换 CosyVoice 零样本音色克隆为 CloudSpeech 音色选择 UI。新建 `VoiceSelector.tsx` 组件，用户从系统音色列表中选择，或输入自定义音色 ID。旧的 `VoiceClonePanel.tsx` 标记 `@deprecated` 保留文件（无现有消费者导入它——其功能通过 `Index.tsx` → `useCosyVoiceTTS` hook 暴露）。

**User Story:** As a user, I want to pick a voice for speech synthesis from a library of high-quality voices, without needing to record a reference audio sample.

**Acceptance Criteria:**
- [ ] AC11.1: New `VoiceSelector` component (`frontend/src/components/VoiceSelector.tsx`) showing CloudSpeech voice options
- [ ] AC11.2: Voice list includes all 9+ system voices (wenrounvsheng, wenrounansheng, linjiajiejie, etc.) with readable Chinese labels
- [ ] AC11.3: Selected voice persisted in localStorage
- [ ] AC11.4: "试听" button plays test text with selected voice
- [ ] AC11.5: Remove recording/upload workflow from voice selection (no more prompt audio)
- [ ] AC11.6: `VoiceClonePanel.tsx` kept intact with `@deprecated` JSDoc comment; new `VoiceSelector.tsx` component created as a clean-sheet implementation. `Index.tsx` updated to pass voice selection state through to `UsagePage` instead of CosyVoice's `hasPromptAudio`/`onSetPromptAudio`/`onClearPromptAudio`.

The following table documents every CosyVoice → CloudSpeech prop migration in the `UsagePage` interface, derived from the existing prop chains in `Index.tsx:7-22` and the `UsagePage` component signature:

| CosyVoice Prop (old) | CloudSpeech Replacement (new) | Notes |
|---|---|---|
| `hasPromptAudio: boolean` | `selectedVoice: string` (current voice ID, e.g. `"wenrounvsheng"`) | Inverts logic: CosyVoice checks "do we have a cloned voice?" → CloudSpeech checks "which voice is selected?" |
| `onSetPromptAudio(audioBlob: Blob)` | `onVoiceChange(voiceId: string)` (called from VoiceSelector) | CosyVoice recorded audio to clone → CloudSpeech selects from a voice list |
| `onClearPromptAudio()` | Removed | No equivalent — selecting a different voice in VoiceSelector replaces the previous one; no explicit "clear" needed |
| `ttsError: string \| null` | `ttsError: string \| null` (unchanged) | CloudSpeech TTS already surfaces errors through this same prop |
| `onSpeak(text: string)` | `onSpeak(text: string)` (unchanged — already wired to `cloud-speech.speak`) | AC10.1 already confirmed |
| `onStop()` | `onStop()` (unchanged — already wired to `cloud-speech.stop`) | AC10.1 already confirmed |
| `isSpeaking: boolean` | `isSpeaking: boolean` (unchanged — already wired to `cloud-speech.isSpeaking`) | AC10.1 already confirmed |

**Header badge change:** The CosyVoice "音色" header badge (visible when `hasPromptAudio` is true) is replaced by showing the selected voice's Chinese name (e.g. "温柔女生") from the static voice list in `useCloudSpeechTTS.ts`. The badge is visible when `selectedVoice` is non-empty.

**ASRStreamingResult "存为音色" button:** The "存为音色" (Save as Voice) button in `ASRStreamingResult` — which previously called `onSetPromptAudio(audioBlob)` to clone the recognized speech — is removed. Voice selection via `VoiceSelector` replaces the voice-cloning workflow entirely. No replacement button is needed: the user selects a voice before speaking, rather than saving a recognized utterance as a voice afterward.

**Shortcut enable condition:** The keyboard shortcut to trigger TTS (e.g. for "复述") previously checked `hasPromptAudio` to ensure a voice was available. This condition changes to `!!selectedVoice` (or equivalently, checking that `selectedVoice` is non-empty). The shortcut is enabled when any voice is selected, disabled when no voice is selected.

**Edge Cases:**
- Custom voice ID invalid → show error from CloudSpeech API, keep previous valid voice
- Voice list is statically defined at compile time (from `useCloudSpeechTTS.ts`); no runtime fetch can fail — the fallback is unnecessary because the voice list is always available

### R12: Error Handling & User Feedback
**Description:** Updated error codes and messages for the CloudSpeech migration.

**Acceptance Criteria:**
- [ ] AC12.1: `asrError.ts` error code set unchanged (covers all needed scenarios)
- [ ] AC12.2: `FALLBACK_ACTIVE` message updated: `msg` "正在使用备用识别" stays; `action` updated from "精度可能略低" to "浏览器识别精度可能略低"
- [ ] AC12.3: CloudSpeech key missing (503 from Worker) mapped to `SERVER_BUSY` (via existing `statusToErrorCode` at `asrError.ts:117`: `status === 429 || status === 503 → 'SERVER_BUSY'`). The existing `SERVER_BUSY` message "识别服务忙碌中" with action "已切换备用识别" is appropriate — it covers both upstream 503 and Worker-generated 503 (key missing). This is the same code path the Worker already uses.
- [ ] AC12.4: `ASRErrorBanner` works with all error codes unchanged
- [ ] AC12.5: CloudSpeech TTS errors surfaced via existing toast/error state patterns

### R13: API Key Security
**Description:** CloudSpeech API Key 绝不暴露给前端。

**Acceptance Criteria:**
- [ ] AC13.1: `CLOUD_SPEECH_API_KEY` only exists in Worker (wrangler secret / .dev.vars), never in frontend code or env
- [ ] AC13.2: Frontend sends audio/text to Worker proxy endpoints (`/api/asr/cloud-speech`, `/api/tts/cloud-speech`), never to `api.cloud-speech.com` directly
- [ ] AC13.3: Worker validates API key presence before proxying; returns 503 if missing (not 500)
- [ ] AC13.4: No CloudSpeech API key or base URL appears in frontend bundle

---

## Dependencies
- **CloudSpeech API**: `POST https://api.cloud-speech.com/v1/audio/asr/sse` (ASR), `POST https://api.cloud-speech.com/v1/audio/speech` (TTS) — both require `Authorization: Bearer <CLOUD_SPEECH_API_KEY>`
- **Existing Worker infra**: Router, ServiceManager, withErrorHandling, createCorsResponse utilities
- **Existing frontend infra**: ASRError type system, useAudioRecorder hook, AudioRecorderButton component
- **No new npm/Go dependencies required**

## Out of Scope
- CloudSpeech WebSocket real-time ASR (`wss://api.cloud-speech.com/v1/realtime/asr/stream`) — out of scope for this migration; the SSE endpoint covers the current one-shot use case
- CloudSpeech file-based async ASR (`/v1/audio/asr/file/submit`) — out of scope
- Removing Whisper/Gemini/CosyVoice worker code — deprecated but kept for backward compatibility
- Go server changes — this migration targets Worker (proxy) and Frontend only; the Go server's job management and MinIO storage remain unchanged. Note: Go server currently registers `/api/whisper-asr` at `server/internal/api/handler.go:482` as a legacy route; it will need deprecation in a follow-up, but this is outside the scope of the current migration.
- Mobile app (Capacitor) specific changes — the web app changes apply universally

## Assumptions
1. **CloudSpeech API Key is already configured** in the Worker environment (`wrangler secret put CLOUD_SPEECH_API_KEY`)
2. **CloudSpeech SSE endpoint is reachable** from Cloudflare Workers (no GFW blocking concerns at the Worker level). Note: Workers serving users in mainland China may terminate in Hong Kong or Singapore edge nodes; actual reachability to `api.cloud-speech.com` must be verified during implementation.
3. **Audio format**: Frontend records in webm/opus (MediaRecorder default). CloudSpeech ASR SSE accepts a `format` block with `type`, `codec`, `rate`, `bits`, `channel`. The exact mapping `{ type: "ogg", codec: "opus", rate: 48000, bits: 16, channel: 1 }` is assumed correct for Chrome's MediaRecorder webm/opus output but needs empirical verification against the CloudSpeech API.
4. **Chinese language** is the primary use case; `language: "zh"` will be sent in ASR requests
5. **Voice cloning removal** is acceptable — users do not need zero-shot voice cloning; the CloudSpeech system voice library is sufficient
6. **Backward compatibility**: Existing localStorage preferences for 'whisper'/'gemini' ASR engines will be gracefully migrated to 'auto'
7. **SSE format**: The CloudSpeech SSE ASR response is assumed to follow a standard SSE format where each `result` event contains a `data` JSON field with the transcript text. The exact event names and JSON structure must be verified against real API responses during implementation. **The SSE parser should be written with configurable event names and JSON paths so it can be tuned empirically without logic changes** (see Implementation Steps §1).

## Open Questions
1. **Q1:** Should the frontend audio format be converted before sending to CloudSpeech? CloudSpeech ASR SSE accepts `format: { type: "<mp3|wav|ogg|flac|opus|aac|raw>", codec, rate, bits, channel }`. Current recorder outputs webm/opus -- need to confirm this maps to `{ type: "ogg", codec: "opus", rate: 48000, bits: 16, channel: 1 }`.
2. **Q2:** Should CosyVoice TTS worker code (`handlers/tts.ts`, `TTSService.ts` voice clone methods) be removed or just deprecated? Task says "deprecate" -- assume keep files, add Deprecation headers, do not delete.
3. **Q3:** What is the exact base64 encoding scheme CloudSpeech expects? Standard base64 (RFC 4648) or base64url? Assume standard base64 with no data URI prefix.
4. **Q4:** Should the `VoiceClonePanel` component be fully removed or kept as deprecated? Decision: **keep file with `@deprecated` JSDoc; create new `VoiceSelector.tsx` component**. See R11.
5. **Q5:** What does the CloudSpeech SSE ASR response actually look like? The event names, JSON structure, and whether text is delivered incrementally or in one final event — this affects the Worker SSE parsing code. Must be tested empirically before finalizing the handler implementation. **Mitigation: the SSE parser in `cloud-speechAsr.ts` will use configurable constants for event names and data paths, making empirical tuning a configuration change, not a logic rewrite.**
6. **Q6:** Can the Cloudflare Worker reach `api.cloud-speech.com` from its deployment region? If CloudSpeech blocks non-China IPs or Cloudflare edge nodes can't reach it, a different proxy architecture may be needed.

---

# Developer Documentation: CloudSpeech Migration

## Architecture Overview

### System Context

```
┌──────────────────────────────────────────────────────────────┐
│                     Frontend (React/TS)                       │
│                                                               │
│  useCloudSpeechASR.ts ──► POST /api/asr/cloud-speech ──┐              │
│  useCloudSpeechTTS.ts ──► POST /api/tts/cloud-speech ──┤              │
│  (browser fallback) ◄── Web Speech API         │              │
│  GET /api/cloud-speech/health ──► health check      │              │
└────────────────────────────────────────────────┼──────────────┘
                                                  │
                                    ┌─────────────▼──────────────┐
                                    │   Cloudflare Worker (TS)    │
                                    │                             │
                                    │  /api/asr/cloud-speech           │
                                    │    └─► CloudSpeech SSE ASR      │
                                    │  /api/tts/cloud-speech (existing)│
                                    │    └─► CloudSpeech TTS          │
                                    │  /api/cloud-speech/health (NEW)  │
                                    │    └─► CLOUD_SPEECH_API_KEY check│
                                    │  /api/whisper-asr (501)     │
                                    │  /api/tts/jobs (501)        │
                                    │  /api/tts/voice-clone (501) │
                                    └─────────────┬──────────────┘
                                                  │
                                    ┌─────────────▼──────────────┐
                                    │  CloudSpeech API (External)     │
                                    │  api.cloud-speech.com/v1         │
                                    │  Auth: Bearer CLOUD_SPEECH_API_KEY│
                                    └────────────────────────────┘
```

### Data Flow: ASR

```
1. User records audio → AudioRecorderButton → useAudioRecorder → webm Blob
2. UsagePage calls useCloudSpeechASR.transcribe(webmBlob)
3. useCloudSpeechASR:
   a. Convert Blob → base64 (FileReader)
   b. POST /api/asr/cloud-speech { audio: "<base64>" }
   c. Retry on transient errors (5xx, network)
   d. On all retries exhausted → browser Web Speech API fallback
4. Worker handler handleCloudSpeechASRRequest:
   a. Validate request body
   b. POST https://api.cloud-speech.com/v1/audio/asr/sse with API key
   c. Parse SSE stream → aggregate text
   d. Return JSON { ok: true, data: { text, model, elapsed_ms } }
5. Frontend renders result in ASRStreamingResult
```

### Data Flow: TTS

```
1. User taps "朗读" / "复述" button
2. ASRStreamingResult / PhrasesPage calls useCloudSpeechTTS.speak(text)
3. useCloudSpeechTTS:
   a. POST /api/tts/cloud-speech { text, voice, model, ... }
   b. Receive audio/binary response → create ObjectURL → play Audio element
4. Worker handler handleCloudSpeechTTSRequest (existing):
   a. POST https://api.cloud-speech.com/v1/audio/speech
   b. Stream audio binary back to frontend
```

---

## File Structure

### Worker (Backend Lane)

```
worker/src/
  handlers/
    cloud-speechAsr.ts          (NEW)     CloudSpeech ASR proxy handler + SSE parser
    cloud-speechTts.ts          (MODIFIED) Add deprecation comment, no logic change
    asr.ts                 (MODIFIED) Add Deprecation header to whisper endpoint
    tts.ts                 (MODIFIED) Add Deprecation header to cosyvoice endpoints
  types/
    env.ts                 (MODIFIED) Add CLOUD_SPEECH_ASR_DEFAULT_MODEL to Env interface
  index.ts                 (MODIFIED) Register /api/asr/cloud-speech + /api/cloud-speech/health routes
```

### Frontend (React Lane)

```
frontend/src/
  hooks/
    useCloudSpeechASR.ts       (NEW)     CloudSpeech ASR hook (replaces useWhisperASR)
    useCloudSpeechTTS.ts       (MODIFIED) No API changes; possibly add voice list helper
    useWhisperASR.ts       (MODIFIED) Add @deprecated JSDoc, keep file
    useCosyVoiceTTS.ts     (MODIFIED) Add @deprecated JSDoc, keep file
    useASREnginePreference.ts  (MODIFIED) Add 'cloud-speech' to preference union type
    useTTS.ts              (UNCHANGED) Browser TTS fallback, unchanged
  types/
    asrEngine.ts           (MODIFIED) Replace 'whisper'|'gemini' with 'cloud-speech'
    asrError.ts            (MODIFIED) Update FALLBACK_ACTIVE action text
    index.ts               (MODIFIED) ASRSettings.provider updated
  components/
    ASREngineIndicator.tsx (MODIFIED) 2-layer display: CloudSpeech → Browser
    ASREngineSelector.tsx  (MODIFIED) 3 options: auto, cloud-speech, browser
    ASREngineCard.tsx      (MODIFIED) 3 engine cards, CloudSpeech health check via /api/cloud-speech/health
    VoiceSelector.tsx      (NEW)       CloudSpeech voice selection (replaces voice cloning workflow)
    VoiceClonePanel.tsx    (MODIFIED)  Add @deprecated JSDoc, no props/behavior changes
    TTSButton.tsx          (UNCHANGED) Generic TTS button, no changes needed
    ASRStreamingResult.tsx (UNCHANGED) Generic display, no changes needed
    ASRErrorBanner.tsx     (UNCHANGED) Works with all error codes
    AudioRecorderButton.tsx (UNCHANGED) Audio recording, unchanged
  pages/
    UsagePage.tsx          (MODIFIED) Wire useCloudSpeechASR (replaces useWhisperASR)
    Index.tsx              (MODIFIED) Update CosyVoice props for voice selection; remove hasPromptAudio/onSetPromptAudio/onClearPromptAudio
    SettingsPage.tsx       (UNCHANGED) No direct VoiceClonePanel import; ASREngineCard update covers ASR side
    TrainingPage.tsx       (UNCHANGED) No ASR/TTS integration
    PhrasesPage.tsx        (UNCHANGED) No direct ASR/TTS integration
  hooks/__tests__/
    useCloudSpeechASR.test.ts  (NEW)       Unit tests for CloudSpeech ASR hook
    useWhisperASR.test.ts  (MODIFIED)  Update mocks for new type references
  components/__tests__/
    ASRStreamingResult.test.tsx (MODIFIED) Update test fixtures for CloudSpeech types
  pages/__tests__/
    UsagePage.test.tsx     (MODIFIED)  Update mocks from useWhisperASR to useCloudSpeechASR

Note: Go server legacy route at `server/internal/api/handler.go:482` (`/api/whisper-asr`) is NOT modified
in this migration. Worker-level deprecation headers cover the proxy layer; the Go server route will be
deprecated in a follow-up change.
```

---

## API Contracts

### POST /api/asr/cloud-speech (NEW)

**Request:**
```json
{
  "audio": "<base64_encoded_audio>",
  "mimeType": "audio/webm",
  "model": "stepaudio-2.5-asr",
  "language": "zh"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `audio` | string | Yes | Base64-encoded audio data (no data URI prefix) |
| `mimeType` | string | No | Audio blob MIME type (e.g. `"audio/webm"`, `"audio/mp4"`). Used by Worker to construct the CloudSpeech `format` block. Defaults to `"audio/webm"` (webm/opus) when missing or unrecognized. |
| `model` | string | No | ASR model name, default `stepaudio-2.5-asr` |
| `language` | string | No | Language code, default `"zh"` |

**Success Response (200):**
```json
{
  "ok": true,
  "data": {
    "text": "你好，这是识别结果",
    "model": "stepaudio-2.5-asr",
    "elapsed_ms": 850
  }
}
```

**Error Response (4xx/5xx):**
```json
{
  "ok": false,
  "error": "音频数据为空"
}
```

**Status Codes:**
| Status | Meaning |
|--------|---------|
| 200 | Transcription complete |
| 400 | Invalid request (missing audio, bad format) |
| 401 | CloudSpeech API key invalid (mapped from upstream) |
| 429 | Rate limited (from upstream) |
| 502 | CloudSpeech upstream error (5xx from CloudSpeech or network failure) |
| 503 | CloudSpeech API key not configured on Worker |

### GET /api/cloud-speech/health (NEW)

**Purpose:** Lightweight health check for frontend `ASREngineCard` to determine CloudSpeech availability. Does NOT probe the CloudSpeech API — only checks that `CLOUD_SPEECH_API_KEY` is configured in the Worker environment.

**Success Response (200):**
```json
{
  "ok": true,
  "provider": "cloud-speech"
}
```

**Error Response (503):**
```json
{
  "ok": false
}
```

**Status Codes:**
| Status | Meaning |
|--------|---------|
| 200 | `CLOUD_SPEECH_API_KEY` is configured, CloudSpeech available |
| 503 | `CLOUD_SPEECH_API_KEY` is missing, CloudSpeech unavailable |

**Implementation note:** This endpoint is a minimal env-var check. It does NOT call `api.cloud-speech.com` — the check is intentionally cheap (no auth round-trip, no API quota consumed). The ASREngineCard treats 200 as "已配置" and 503 as "待配置".

### POST /api/tts/cloud-speech (EXISTING -- Documented for Reference)

**Request:**
```json
{
  "text": "你好世界",
  "voice": "wenrounvsheng",
  "model": "step-tts-mini",
  "speed": 1.0,
  "volume": 1.0,
  "response_format": "mp3",
  "sample_rate": 24000,
  "instruction": ""
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | Text to synthesize (max 1000 chars) |
| `voice` | string | No | Voice ID, default `wenrounvsheng` |
| `model` | string | No | Model: `step-tts-mini`, `step-tts-2`, `stepaudio-2.5-tts` |
| `speed` | number | No | Speed 0.5–2.0, default 1.0 |
| `volume` | number | No | Volume 0.1–2.0, default 1.0 |
| `response_format` | string | No | Format: `mp3`, `wav`, `flac`, `opus`, `pcm` |
| `sample_rate` | number | No | Sample rate: 8000/16000/22050/24000/48000 |
| `instruction` | string | No | Voice instruction (only for `stepaudio-2.5-tts`) |

**Success Response (200):** Binary audio data with Content-Type matching `response_format`.

**Deprecation Response Headers:**
| Header | Value |
|--------|-------|
| `Deprecation` | `true` (on `/api/whisper-asr`, `/api/asr/jobs`, `/api/tts/jobs`, `/api/tts/voice-clone` responses) |

---

## Data Models

### Type Changes -- Frontend

**`asrEngine.ts` (MODIFIED):**
```typescript
// Before
export type ASREngine = 'whisper' | 'gemini' | 'browser';
export type ASREngineStage =
  | 'idle'
  | 'whisper-trying'
  | 'gemini-trying'
  | 'browser-trying'
  | 'success'
  | 'failed';

// After
export type ASREngine = 'cloud-speech' | 'browser';
export type ASREngineStage =
  | 'idle'
  | 'cloud-speech-trying'
  | 'browser-trying'
  | 'success'
  | 'failed';
```

**`useASREnginePreference.ts` (MODIFIED):**
```typescript
// Before
export type ASREnginePreference = 'auto' | 'whisper' | 'gemini' | 'browser';

// After
export type ASREnginePreference = 'auto' | 'cloud-speech' | 'browser';
```

**`types/index.ts` (MODIFIED):**
```typescript
// Before
export interface ASRSettings {
  provider: 'whisper';
}
export const DEFAULT_ASR_SETTINGS: ASRSettings = {
  provider: 'whisper',
};

// After
export interface ASRSettings {
  provider: 'cloud-speech' | 'browser';
}
export const DEFAULT_ASR_SETTINGS: ASRSettings = {
  provider: 'cloud-speech',
};
```

### Type Changes -- Worker

**`types/env.ts` (MODIFIED):**
```typescript
// Add to Env interface:
CLOUD_SPEECH_ASR_DEFAULT_MODEL?: string;  // Optional override, default stepaudio-2.5-asr
```

---

## Component Interfaces

### useCloudSpeechASR (NEW Hook)

```
Hook: useCloudSpeechASR() -> UseCloudSpeechASRReturn

Return type:
  finalText: string                // Last successful transcription
  isProcessing: boolean            // Currently fetching
  error: ASRError | null           // Structured error (same as useWhisperASR)
  errorMessage: string | null      // Backward-compatible error string
  transcribe: (audioBlob: Blob) => Promise<string | null>  // Main entry point
  reset: () => void                // Clear all state

Internal behavior:
  - Converts Blob to base64 via FileReader.readAsDataURL + strip prefix
  - Captures the Blob's MIME type via `audioBlob.type` (e.g. "audio/webm" from Chrome, "audio/mp4" from Safari)
  - POST /api/asr/cloud-speech with { audio: "<base64>", mimeType, model, language }
  - Retries on transient errors: 3 attempts max, exponential backoff + jitter
  - On exhaustion: browserSpeechFallback() → Web Speech API
  - On all failure: structured ASRError emitted via emitTelemetry
```

### VoiceSelector (NEW Component)

```
Component: VoiceSelector
File:      frontend/src/components/VoiceSelector.tsx (NEW)

Props:
  selectedVoice: CloudSpeechVoice            // Currently selected voice ID
  onVoiceChange: (voice: CloudSpeechVoice) => void
  onTestVoice: (text: string) => Promise<void>  // Test playback with selected voice
  isTestSpeaking: boolean
  className?: string

Internal:
  - Renders list of 9+ system voices with Chinese labels
  - Each voice: radio button + label (Chinese name) + test button ("试听")
  - "自定义音色" input for custom voice ID
  - Persists selection to localStorage

Behavior (new component, no existing consumer coupling):
  - **Data source:** Uses the static voice list from `useCloudSpeechTTS.ts:13-23` (a TypeScript union type of 9+ voice IDs with Chinese labels). No async fetch — the list is available synchronously at import time. VoiceSelector renders immediately on mount.
  - Design System: Uses Button (ghost for test, outline for select), radio-group pattern
    from Radix, lucide-react Volume2 icon for test button, cn() for conditional classes.
  - States:
    - Normal: Voice list rendered as radio group with labels + test button per voice
    - Test playing: test button shows spinner, isTestSpeaking disables other test buttons
    - Test error: toast notification (no inline error state needed)
  - Responsive: Voice list is vertical stack on mobile, grid on desktop (follows
    design system card grid pattern)
  - Accessibility: radio group pattern with aria-checked, keyboard selection,
    test button aria-label="试听 {voiceLabel}"

Replaces:
  - VoiceClonePanel's recording/upload/clone workflow (entirely different interface —
    zero prop overlap). VoiceClonePanel remains in codebase with @deprecated JSDoc.
```

---

## State Management

### Frontend State Flow
- **ASR flow**: `useCloudSpeechASR` owns internal state (finalText, isProcessing, error). UsagePage consumes return values and renders via ASRStreamingResult / ASRErrorBanner.
- **ASR preference**: `useASREnginePreference` stores `'auto' | 'cloud-speech' | 'browser'` in localStorage. Shared across components via hook.
- **TTS flow**: `useCloudSpeechTTS` owns internal state (isSpeaking, error). UsagePage/PhrasesPage call speak/stop directly. **Already wired** in `Index.tsx:7-22`.
- **Voice selection**: New localStorage key for selected CloudSpeech voice ID. VoiceSelector reads/writes it. Replaces CosyVoice `hasPromptAudio`/`onSetPromptAudio`/`onClearPromptAudio` prop chain in `Index.tsx`.

### Worker State
- Stateless: Worker handlers are pure request → response functions. No session state.
- `CLOUD_SPEECH_API_KEY` read from env per-request.

---

## Implementation Steps

### Step 1: Worker — CloudSpeech ASR handler (NEW)
1. Create `worker/src/handlers/cloud-speechAsr.ts`
2. Implement `handleCloudSpeechASRRequest(request, serviceManager, env)`
3. Parse JSON body, validate `audio` field, extract optional `mimeType`
4. Construct CloudSpeech SSE request body with audio format metadata: map `mimeType` to CloudSpeech `format` block (`type`, `codec`, `rate`, `bits`, `channel`). Default to webm/opus (`{ type: "ogg", codec: "opus", rate: 48000, bits: 16, channel: 1 }`) when `mimeType` is missing or unrecognized.
5. Fetch `POST https://api.cloud-speech.com/v1/audio/asr/sse`
6. **Parse SSE response stream with configurable constants** — event names (`"result"`) and JSON data paths (`data.data` or `data.text`) extracted into named constants at the top of the file so they can be tuned empirically without logic changes (mitigates Open Questions Q1/Q5). Aggregate `result` event data.
7. Return JSON with aggregated text
8. Add error handling for all failure modes

### Step 2: Worker — Register routes (ASR + health)
1. In `worker/src/index.ts`, import `handleCloudSpeechASRRequest`
2. Register `POST /api/asr/cloud-speech` route (or short-circuit before router, same pattern as CloudSpeech TTS)
3. Add `GET /api/cloud-speech/health` route — returns `{ ok: true, provider: "cloud-speech" }` (200) if `CLOUD_SPEECH_API_KEY` is present in env; returns `{ ok: false }` (503) if missing
4. Add `CLOUD_SPEECH_ASR_DEFAULT_MODEL` to `types/env.ts`

### Step 3: Worker — Mark deprecations
1. In `handlers/asr.ts` `handleWhisperASRRequest`: add `Deprecation: true` header to 501 response
2. In `handlers/tts.ts` `handleTTSJobSubmitRequest` and `handleVoiceCloneJobSubmitRequest`: add `Deprecation: true` header

### Step 4: Frontend — Update types
1. Update `asrEngine.ts`: change `ASREngine` and `ASREngineStage` types
2. Update `useASREnginePreference.ts`: change `ASREnginePreference` type, add migration for old localStorage values
3. Update `types/index.ts`: change `ASRSettings.provider`
4. Update `asrError.ts`: change `FALLBACK_ACTIVE` action text from `"精度可能略低"` to `"浏览器识别精度可能略低"`
5. Run `npm run typecheck` to verify no breakage

### Step 5: Frontend — Create useCloudSpeechASR hook
1. Create `frontend/src/hooks/useCloudSpeechASR.ts`
2. Copy retry/fallback pattern from `useWhisperASR.ts`
3. Replace multipart form upload with base64 JSON POST
4. Keep same return interface for drop-in compatibility
5. Create `frontend/src/hooks/__tests__/useCloudSpeechASR.test.ts` (NEW) covering: happy path, retry exhaustion, browser fallback, network offline, empty audio, base64 failure

### Step 6: Frontend — Update UI components
1. Update `ASREngineIndicator.tsx`: 2-layer display (阶跃星辰 → 浏览器)
2. Update `ASREngineSelector.tsx`: 3 options (auto, cloud-speech, browser)
3. Update `ASREngineCard.tsx`: 3 engine cards, CloudSpeech health check via `GET /api/cloud-speech/health` (not `/api/_readyz`)
4. Create `frontend/src/components/VoiceSelector.tsx` (NEW) — clean-sheet component with system voice list + custom voice ID input + test playback. See VoiceSelector interface above for props and state behavior.
5. Mark `frontend/src/components/VoiceClonePanel.tsx` with `@deprecated` JSDoc comment; no code changes to existing logic

### Step 7: Frontend — Wire pages
1. Update `UsagePage.tsx`: replace `useWhisperASR` import with `useCloudSpeechASR`; keep same destructured return values
2. Update `Index.tsx`: replace CosyVoice `hasPromptAudio`/`onSetPromptAudio`/`onClearPromptAudio` props with voice selection state from VoiceSelector (see R11 prop migration table for the complete mapping); keep existing CloudSpeech TTS `speak`/`stop`/`isSpeaking`/`error` wiring (already implemented). Also update the header badge from CosyVoice "音色" to the selected voice's Chinese name, remove the `ASRStreamingResult` "存为音色" button, and update the shortcut enable condition from `!hasPromptAudio` to `!!selectedVoice`.
3. Confirm `SettingsPage.tsx` needs no changes (no direct VoiceClonePanel or CosyVoice imports — it uses `useTTS` hook for browser voices and `ASREngineCard` for ASR engine)
4. Update test files: `UsagePage.test.tsx` mock from `useWhisperASR` to `useCloudSpeechASR`; `useWhisperASR.test.ts` update type references

### Step 8: Frontend — Update error messages
1. Update `asrError.ts` FALLBACK_ACTIVE action text (done in Step 4)
2. Verify `statusToErrorCode` at `asrError.ts:117` correctly maps 503 → `SERVER_BUSY` (already correct, no change needed)
3. Confirm `SERVER_BUSY` message "识别服务忙碌中" with action "已切换备用识别" is appropriate for the CloudSpeech-key-missing scenario

### Step 9: Integration test
1. Run `npm run typecheck` in frontend
2. Run `npm run lint` in frontend
3. Run `npm run test` in frontend (update tests that reference Whisper/Gemini engine types)
4. Verify Worker builds: `cd worker && npm run build` (or equivalent)
5. Manual smoke test: record audio → ASR → TTS playback
6. Verify `GET /api/cloud-speech/health` returns correct response for key-present and key-missing scenarios

---

## Error Handling

### Worker Error Mapping

| Condition | HTTP Status | Error Message |
|-----------|-------------|---------------|
| Missing `audio` field | 400 | 缺少音频数据 |
| Empty `audio` string | 400 | 音频数据为空 |
| Invalid JSON body | 400 | 请求体必须是 JSON |
| `CLOUD_SPEECH_API_KEY` missing | 503 | CloudSpeech API Key 未配置 |
| CloudSpeech returns 401 | 503 (mask upstream) | CloudSpeech API Key 无效或已吊销 |
| CloudSpeech returns 429 | 429 | CloudSpeech 请求频率受限，请稍后重试 |
| CloudSpeech returns 4xx (other) | 400 | 请求参数错误 |
| CloudSpeech returns 5xx | 502 | CloudSpeech 服务暂时不可用 |
| Network error to CloudSpeech | 502 | CloudSpeech 上游请求失败 |
| SSE stream empty (no result events) | 200 with empty text | "未能识别到语音内容" (handled by frontend) |

### Frontend Error Mapping

| Scenario | ASRErrorCode | Retryable |
|----------|-------------|-----------|
| Network offline | NETWORK_OFFLINE | true |
| Request timeout | NETWORK_TIMEOUT | true |
| 429 from Worker | SERVER_BUSY | true |
| 503 from Worker (key missing or CloudSpeech auth rejected) | SERVER_BUSY | true |
| 5xx from Worker (other) | SERVER_ERROR | true |
| 400 from Worker | BAD_REQUEST | false |
| 413 from Worker | QUOTA_EXCEEDED | false |
| Fallback active | FALLBACK_ACTIVE | false |
| All failed | ALL_FAILED | true |

> **Verification note:** `statusToErrorCode` at `asrError.ts:117` handles the 503 → `SERVER_BUSY` mapping: `if (status === 429 || status === 503) return 'SERVER_BUSY';`. This covers both the Worker's own 503 (key missing) and upstream 401 masked to 503 (key invalid). The `SERVER_BUSY` message "识别服务忙碌中" with action "已切换备用识别" (`retryable: true`) is appropriate — the user sees a clear message and retry is available.
>
> **Retryability check:** The existing `isRetryable()` function in `useWhisperASR.ts` (to be replicated in `useCloudSpeechASR.ts`) returns `false` for 400/4xx by default. The frontend error mapping table above is consistent with this: `BAD_REQUEST` (400) is non-retryable because retrying the same invalid body produces the same 400. Only transient errors (5xx, 429, network failures) are retried.

---

## Edge Cases

| Edge Case | Implementation Approach |
|-----------|------------------------|
| Empty audio blob | useCloudSpeechASR returns null immediately, no request sent |
| Audio > 25MB base64 | Worker checks body size, returns 413 if excessive |
| base64 conversion fails | FileReader.onerror → set error BAD_REQUEST |
| CloudSpeech SSE returns 0 events | Worker returns `{ text: "" }`, frontend shows "未能识别到语音内容" |
| SSE drops mid-stream | Worker aggregates partial text, returns it with diagnostic note |
| Old localStorage engine preference ('whisper', 'gemini') | useASREnginePreference reads value, if invalid falls back to 'auto' |
| Browser has no Web Speech API | browserSpeechFallback returns null → show ALL_FAILED error |
| CloudSpeech TTS returns non-audio response | useCloudSpeechTTS catches JSON response, throws error |
| CloudSpeech API key rotated | Worker reads from env per-request, picks up new key immediately |
| Voice list unavailable | Voice list is a static TypeScript union type in `useCloudSpeechTTS.ts` — always available at import time, no runtime fetch |
| Custom voice ID invalid | CloudSpeech TTS returns error, VoiceSelector keeps previous valid voice |
| CloudSpeech health check fails (503) | ASREngineCard shows "CloudSpeech 待配置" |
| Unknown or missing audio MIME type | Worker defaults to webm/opus format block (`{ type: "ogg", codec: "opus", rate: 48000, bits: 16, channel: 1 }`); covers Chrome MediaRecorder default output |

---

## Non-Functional Requirements

### Performance
- ASR: Target p95 latency < 3s end-to-end (record → transcript displayed). CloudSpeech claims 5-min audio in 1 second processing; network round-trip from Worker to CloudSpeech adds ~200ms.
- TTS: Target p95 latency < 2s for text-to-speech playback start. Existing CloudSpeech TTS already meets this.
- Audio upload: webm Blob compressed for network; base64 encoding adds ~33% size overhead. For typical 10s recording (~50KB webm), base64 is ~67KB — acceptable.

### Security
- `CLOUD_SPEECH_API_KEY` stored as Cloudflare Worker secret (`wrangler secret put`), never in source code or frontend env
- Frontend never sees the API key; all CloudSpeech calls proxied through Worker
- Worker validates request body before proxying to CloudSpeech
- Worker masks upstream 401 as 503 to avoid leaking auth state

### Accessibility
- ASREngineIndicator: `role="status"`, `aria-live="polite"`, `aria-label` per stage
- ASREngineSelector: `role="radiogroup"`, `aria-checked` on each option
- Error messages: `role="alert"` on error banners, screen-reader friendly text
- VoiceSelector: keyboard-navigable radio group, clear labels, `aria-label="试听 {voiceLabel}"` on test buttons

### Responsive Design
- ASREngineCard: responsive grid (1-col mobile → 2-col tablet → 3-col on desktop)
- VoiceSelector: vertical stack on mobile, card grid on desktop
- All new components follow existing mobile patterns from `ui-design-system.md` and `mobile-design-guidelines.md`

### Observability
- Worker logs: each ASR request logs audio size, model, elapsed time, status
- Frontend telemetry: `emitTelemetry()` called on all errors (existing pattern)
- Worker returns `elapsed_ms` in ASR response for frontend timing
- Health endpoint logged per-request for availability monitoring

---

## Spec Traceability

| Spec Req | Implementation | Files |
|----------|---------------|-------|
| R1: CloudSpeech ASR Proxy | New handler `handleCloudSpeechASRRequest` receives base64 audio + `mimeType` → maps `mimeType` to CloudSpeech `format` block → calls `POST api.cloud-speech.com/v1/audio/asr/sse` → parses SSE (configurable event names/paths) → returns JSON | `worker/src/handlers/cloud-speechAsr.ts` (NEW), `worker/src/index.ts` (MODIFIED) |
| R2: ASR Configuration & Health | Reuse `CLOUD_SPEECH_API_KEY` env var; add optional `CLOUD_SPEECH_ASR_DEFAULT_MODEL`; add `GET /api/cloud-speech/health` endpoint for key-presence check | `worker/src/types/env.ts` (MODIFIED), `worker/src/handlers/cloud-speechAsr.ts` (NEW — health handler or separate), `worker/src/index.ts` (MODIFIED) |
| R3: Deprecate Whisper/Gemini | Add `Deprecation: true` header to existing 501 responses | `worker/src/handlers/asr.ts` (MODIFIED) |
| R4: CloudSpeech TTS (existing) | Existing `/api/tts/cloud-speech` endpoint unchanged; add Deprecation to CosyVoice endpoints | `worker/src/handlers/tts.ts` (MODIFIED — deprecation headers) |
| R5: CloudSpeech ASR Engine Type | Update `ASREngine`, `ASREngineStage`, `ASREnginePreference`, `ASRSettings` types | `frontend/src/types/asrEngine.ts` (MODIFIED), `frontend/src/hooks/useASREnginePreference.ts` (MODIFIED), `frontend/src/types/index.ts` (MODIFIED) |
| R6: useCloudSpeechASR Hook | New hook with base64 encoding, retry logic, browser fallback — same interface as useWhisperASR | `frontend/src/hooks/useCloudSpeechASR.ts` (NEW), `frontend/src/hooks/__tests__/useCloudSpeechASR.test.ts` (NEW) |
| R7: ASREngineIndicator | 2-layer display: 阶跃星辰 → 浏览器, Chinese labels only | `frontend/src/components/ASREngineIndicator.tsx` (MODIFIED) |
| R8: ASREngineSelector | 3 options: auto, cloud-speech, browser | `frontend/src/components/ASREngineSelector.tsx` (MODIFIED) |
| R9: ASREngineCard | 3 engine cards, CloudSpeech health check via `GET /api/cloud-speech/health` | `frontend/src/components/ASREngineCard.tsx` (MODIFIED) |
| R10: TTS Primary | **Already implemented:** Index.tsx wires CloudSpeech `speak`/`stop` as primary TTS (AC10.1, AC10.5 done). Confirm `ASRStreamingResult` uses onSpeak prop chain; confirm TTS error propagation. | `frontend/src/pages/Index.tsx` (MODIFIED — voice selection props), `frontend/src/pages/UsagePage.tsx` (confirm only) |
| R11: Voice Selection | New `VoiceSelector.tsx` component using static voice list from `useCloudSpeechTTS.ts`; `VoiceClonePanel.tsx` marked @deprecated; `Index.tsx` updated to pass `selectedVoice`/`onVoiceChange` instead of CosyVoice's `hasPromptAudio`/`onSetPromptAudio`/`onClearPromptAudio`; `ASRStreamingResult` "存为音色" button removed; header badge shows selected voice name; shortcut condition changed from `!hasPromptAudio` to `!!selectedVoice` | `frontend/src/components/VoiceSelector.tsx` (NEW), `frontend/src/components/VoiceClonePanel.tsx` (MODIFIED — @deprecated), `frontend/src/pages/Index.tsx` (MODIFIED), `frontend/src/pages/UsagePage.tsx` (MODIFIED), `frontend/src/components/ASRStreamingResult.tsx` (MODIFIED) |
| R12: Error Handling | Update `FALLBACK_ACTIVE` action text; verify 503 → `SERVER_BUSY` mapping (already correct in `asrError.ts:117`); no new error codes needed | `frontend/src/types/asrError.ts` (MODIFIED) |
| R13: API Key Security | Key exists only in Worker env; frontend never accesses `api.cloud-speech.com` directly; health endpoint confirms key presence without exposing it | Verified by code review and bundle analysis |
