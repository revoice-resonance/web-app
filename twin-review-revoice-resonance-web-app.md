# Twin-Review 最终合并报告 — revoice-resonance/web-app

- 产物：`/Users/evander/Downloads/web-app`
- Git HEAD：`dacd0c2`
- K12 总评：`REWORK`（3 个必修 finding）
- PAI 自家最终结论：未产出（主任务 429 配额中断）
- PAI 派生 Explore 子审：返回完整高置信 findings，作为 PAI 视角证据
- 合并总评：**`REWORK`**
- 共识 findings：3
- PAI 额外盲点：8
- K12 额外盲点：0（K12 已聚焦 3 个必修）
- 漏：未跑依赖安装、未做端到端、CI 依赖 Bun 未装、Go 测试未跑

---

## 共识 findings（双子都看到，高可信，必修）

### 1. P1 — 前端 `ASREngineIndicator` 导入不存在的类型，构建会爆

- 证据：
  - `frontend/src/components/ASREngineIndicator.tsx:2`
  - `frontend/src/hooks/useWhisperASR.ts:9-21`
- 问题：组件从 `useWhisperASR` 导入 `ASREngine` / `ASREngineStage`，但 hook 没有 export。
- 影响：TS 编译 / 类型检查在该文件被纳入时一定失败。
- 触发规则：K12 R4 / R8 / R12。
- 修复方向：把类型定义放到 `frontend/src/types/`，或者在 `useWhisperASR.ts` 显式 export。

### 2. P1 — Worker MinIO S3 签名对普通 Header 会崩，上传链路不可用

- 证据：
  - `worker/src/utils/s3-signer.ts:28-29`
  - `worker/src/storage/MinioStorage.ts:80-83`
- 问题：签名器 lower-case header key 后回查原始 headers，调用方传 `Content-Type` / `Content-Length`，导致 `headers["content-type"]` 为 `undefined`，`.trim()` 抛错。
- 影响：音频上传、语料上传、日志/任务结果写入全部确定性失败。
- 触发规则：K12 R4 / R5 / R12。
- 修复方向：用 `Object.fromEntries` 一次性 lower-case 化，或者签名输入输出都用同一份 key。

### 3. P1 — K8s Deployment 引用缺失 ConfigMap key；Server 在无 MinIO 时仍 ready 且 nil panic

- 证据：
  - `server/deploy/k8s/deployment.yaml:7-9`：只定义 `MINIO_REGION` / `MINIO_USE_SSL`
  - `server/deploy/k8s/deployment.yaml:47-51`：引用 `MINIO_ENDPOINT`
  - `server/cmd/server/main.go:61-68`：MinIO 未配置仍 `ready.Store(true)`
  - `server/internal/service/job.go:313-320`：解引用 `s.storage`
- 影响：K8s Pod 可能起不来；即使绕过配置，readiness 通过后音频/语料/voice clone 上传仍会 nil panic。
- 触发规则：K12 R4 / R9 / R12。
- 修复方向：补 `MINIO_ENDPOINT`；或者 readiness 反映 MinIO 真实状态；或者 storage 强 nil-check + 503。

---

## PAI 派生 Explore 子审额外盲点（K12 未覆盖，高价值）

### 4. P1 — ASR 前端 ↔ Worker 协议不匹配

- 前端发 `FormData` 到 `/api/whisper-asr`：`frontend/src/hooks/useWhisperASR.ts:117-143`
- Worker 路由 `/api/whisper-asr` 到 `handleASRJobSubmitRequest`，要求 JSON `audioKey`：`worker/src/index.ts:28-29`、`worker/src/handlers/asr.ts:14-22`
- 影响：语音识别主链路按当前实现不可用。

### 5. P1 — TTS 前端期望音频，Worker 返回 JSON job

- 前端 `/api/tts/jobs` 与 `/api/tts/voice-clone` 请求后判 JSON 为错误：`frontend/src/hooks/useCosyVoiceTTS.ts:128-156`
- Worker 返回 `createSuccessResponse(job)` JSON：`worker/src/handlers/tts.ts:21-30`、`tts.ts:66-75`
- 影响：CosyVoice TTS 不会播放。

### 6. P1 — Corpus 采集路径/字段不匹配

- 前端 POST `/api/corpus`，字段 `file` / `label` / `duration_ms`：`frontend/src/hooks/useCorpusCollection.ts:16`、`useCorpusCollection.ts:44-59`
- Worker 仅注册 `/api/corpus/upload`，字段 `audio` / `transcript`：`worker/src/index.ts:44`、`worker/src/handlers/corpus.ts:13-26`
- 影响：自动语料采集永远失败。

### 7. P1 — Diagnostics 日志上传路径/负载不匹配

- 前端 POST `/api/client-logs`，字段 `entries`：`frontend/src/components/DiagnosticsPanel.tsx:66-77`
- Worker 注册 GET `/api/client-logs`；POST 真正路径是 `/api/logs/client-upload`，字段 `logs`：`worker/src/index.ts:38-39`、`worker/src/handlers/logs.ts:27-41`
- 影响：诊断日志上传失败。

### 8. P1 — Server 错误处理把非 200 状态码伪装成 200 success

- 多个 handler 返回 `(nil, http.StatusMethodNotAllowed, nil)` 等：`server/internal/api/handler.go:101-104`、`:139-141`、`:161-164`、`:180-183`
- wrapper 只在 `err != nil` 时用 status，否则永远 `Success`：`server/internal/api/handler.go:525-537`
- 影响：错误的方法 / 缺失字段会被报成 200，监控和客户端全失真。

### 9. P1 — 无鉴权 + wildcard CORS 暴露日志 / 语料 / 任务接口

- 公开路由：`worker/src/index.ts:25-51`
- CORS `*`：`worker/src/utils/index.ts:67-71`、`worker/src/middleware.ts:76-80`
- 影响：任意来源可写日志、写语料、查日志。对言语障碍用户产品是隐私红线。

### 10. P1 — CI 用 pnpm，但根 build script 调用 bun

- workflow 跑 `pnpm install` + `pnpm build`：`.github/workflows/deploy.yml:19-20`
- 根 `package.json:5-7` 是 `cd frontend && bun run build`
- 影响：标准 GitHub runner 没有 bun，部署会失败。

### 11. P1 — CI 跳过 lint / test / typecheck

- workflow 没运行 `frontend` 的 lint/test 或 `worker` 的 typecheck：`.github/workflows/deploy.yml:19-24`
- 影响：错误直接上线。

---

## P2 findings（建议排进第二批修）

### 12. ASR 引擎选择 UI 没有驱动实际运行时

- 证据：
  - `frontend/src/components/ASREngineCard.tsx:53-54`、`:119`
  - `frontend/src/hooks/useASREnginePreference.ts:7-13`
  - `frontend/src/hooks/useWhisperASR.ts:140`、`:216`
- 影响：选了 Gemini / browser / whisper-only 不真正生效。

### 13. ASR/TTS 测试仍指向旧 Supabase functions endpoint

- 证据：
  - `frontend/src/hooks/__tests__/useWhisperASR.test.ts:220`
  - `frontend/src/hooks/__tests__/useCosyVoiceTTS.test.ts:82`
- 实现路径：
  - `frontend/src/hooks/useWhisperASR.ts:140`
  - `frontend/src/hooks/useCosyVoiceTTS.ts:128`、`:134`
- 影响：测试不再反映当前路由意图。

### 14. Worker middleware 注册但没执行

- 证据：`worker/src/index.ts:53-55`、`:80-82`、`worker/src/middleware.ts:22-40`
- 影响：除 `/api/tts/cloud-speech` 外，preflight 走 router miss 后落到 `env.ASSETS.fetch(request)`，CORS 行为不可控。

### 15. Worker 对静态资源强制 `.text()` 检查

- 证据：`worker/src/index.ts:82-88`
- 影响：JS/CSS/图片被额外 buffer/decode；以 `-` 开头的合法内容可能被误判 500。

### 16. MinIO 写入 key 与 job metadata 保存 key 不一致

- 证据：
  - `worker/src/storage/MinioStorage.ts:114-117`、`:128-131`
  - `worker/src/services/ASRService.ts:84-90`
  - `worker/src/services/TTSService.ts:96-102`
- 影响：completed 之后查结果可能 404。

### 17. Worker 后台任务用 `setTimeout` 而非 `ctx.waitUntil`

- 证据：
  - `worker/src/services/ASRService.ts:40-42`
  - `worker/src/services/TTSService.ts:45-47`、`:74-76`
- 影响：响应返回后任务可能被 worker runtime 杀掉。

### 18. cf-pages 代理没接入 root deploy workflow

- 证据：
  - `.github/workflows/deploy.yml:19-23`
  - `package.json:7`
  - `wrangler.jsonc:2-4`
  - `cf-pages/_worker.js:6-20`、`cf-pages/wrangler.toml:7-9`、`cf-pages/pages.yaml:4-5`
- 影响：`cf-pages` 内的 proxy/wrangler/pages 配置变成 deploy-dead。

### 19. Server Dockerfile / docker-compose 路径不匹配

- 证据：
  - `server/Dockerfile:10`：`COPY go.mod go.sum ./`
  - `server/deploy/docker-compose.yaml:5-8`：`context: ..` + `dockerfile: server/Dockerfile` → 解析成 `server/server/Dockerfile`
  - 仓库内无 `go.sum`
- 影响：server 镜像构建不可用。

### 20. Server 在多副本部署下用内存状态

- 证据：
  - `server/internal/service/job.go:30-35`、`:89-91`、`:131-133`
  - `server/deploy/k8s/deployment.yaml:28`（replicas 配置）
- 影响：pod A 提交，pod B 查询就 not found；重启即丢。

### 21. 上传路径整文件读入内存

- 证据：
  - `server/internal/api/handler.go:106-117`、`:228-243`、`:269-279`
  - `worker/src/handlers/audio.ts:21`、`worker/src/handlers/corpus.ts:35`
- 影响：可扩展性差；无 auth/rate-limit 时 DoS 风险高。

### 22. 前端 `strict: false`，API 协议漂移不容易被 TS 抓住

- 证据：`frontend/tsconfig.app.json:16-17`、`:25`
- 影响：以上 ASR/TTS/corpus/logs 协议漂移没有编译期 guard。

### 23. Privacy 文本与实际行为冲突

- DataPage 声明数据本地存储：`frontend/src/pages/DataPage.tsx:167-171`
- 但语料 hook 默认会静默上传：`frontend/src/hooks/useCorpusCollection.ts:3-13`、`:27-59`
- 影响：合规与用户同意问题。

### 24. 声纹样本以 base64 存进 localStorage

- 证据：`frontend/src/hooks/useCosyVoiceTTS.ts:33-47`、`:60-69`
- 影响：声纹可能算生物特征，本地未加密。

### 25. K8s Deployment 提交了 `stringData` 占位 Secret

- 证据：`server/deploy/k8s/deployment.yaml:12-19`
- 影响：占位 Secret 在源码里容易替换为真实凭据。

---

## 验证

- 仓库本地存在且可读：`/Users/evander/Downloads/web-app`
- Git HEAD：`dacd0c2`
- K12 双子：completed，`REWORK`，3 个必修 finding
- PAI 主任务：completed，但返回 429 配额错误；PAI 自家 VERDICT 报告未产出
- PAI 派生 Explore 子审：completed，9 个 P1 + 14 个 P2
- 本地 grep/read 抽样验证：
  - 已确认 `frontend/src/components/ASREngineIndicator.tsx:2` 引用类型未导出
  - 已确认 `worker/src/utils/s3-signer.ts:28-29` header 处理逻辑
  - 已确认 `worker/src/handlers/asr.ts:14-18` 期望 JSON `audioKey`
  - 已确认 `frontend/src/hooks/useWhisperASR.ts:140` 发送 FormData
  - 已确认 `server/cmd/server/main.go:61-68` ready 不等 MinIO
  - 已确认 `server/deploy/k8s/deployment.yaml` ConfigMap 与 Deployment key 错位
- 未执行依赖安装，未做远程部署，未修改仓库源文件
- 上游 5 小时配额在 2026-06-11 19:08:55 +0800 重置

---

## 修复优先级建议

第一批：先救主链路与可构建性。

1. 修复 `ASREngineIndicator` 类型导入，构建先能过。
2. 修 MinIO S3 signer header 规范化，存储路径先能跑。
3. K8s 补 `MINIO_ENDPOINT`；Server readiness 反映 MinIO 状态。
4. ASR / TTS 前后端协议统一（要么同步、要么 job+轮询，二选一）。
5. Corpus / Diagnostics 路径与字段统一。
6. Server 错误处理不要把非 200 状态码包成 200。
7. CI 装 bun 或改 script 到 pnpm，并加 lint / test / typecheck。
8. 给日志 / 语料 / 任务接口加鉴权与限流。

第二批：架构级整改。

1. Worker job 状态改 Durable Object / KV / D1 / Queue。
2. 用 `ctx.waitUntil` 接管后台任务。
3. MinIO 写入 key 与 job metadata key 一致化。
4. Server 多副本状态外移到数据库 / Redis。
5. 上传改流式 + 大小限制。
6. 修隐私文案、声纹 localStorage、占位 Secret。
7. cf-pages 与 root deploy 流程二选一并明确。
8. 打开 TS `strict` 与 contract 测试。
