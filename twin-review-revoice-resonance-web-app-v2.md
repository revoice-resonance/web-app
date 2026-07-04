# Twin-Review 最终合并报告 — revoice-resonance/web-app

- 产物：`/Users/evander/Downloads/web-app`
- Git HEAD：`dacd0c2`
- 本地工作区：无变更（`git status --short` 为空）
- 合并视角：K12（前两轮）+ PAI 派生 Explore 子审 + 本地直接抽审（worker/utils/s3-signer、worker/storage/MinioStorage、worker/index、worker/handlers/asr、worker/handlers/tts、frontend/ASREngineIndicator、frontend/useWhisperASR、frontend/useCosyVoiceTTS、server/main、server/deploy/k8s/deployment.yaml）
- 合并总评：**`REWORK`**

---

## 共识 findings（双子 + 本地抽审均确认，必修）

### 1. P1 — 前端 `ASREngineIndicator` 导入不存在的类型，构建会爆

- 证据：
  - `frontend/src/components/ASREngineIndicator.tsx:2` → `import type { ASREngine, ASREngineStage } from '@/hooks/useWhisperASR';`
  - `frontend/src/hooks/useWhisperASR.ts:1-21` → 只 export `useWhisperASR` 与 `UseWhisperASRReturn`，未 export `ASREngine` / `ASREngineStage`。
- 影响：任何纳入该文件的 TS 编译一定失败。
- 修复：把类型定义迁到 `frontend/src/types/`，或在 `useWhisperASR.ts` 加 export。

### 2. P1 — Worker MinIO S3 签名 header 处理逻辑断

- 证据：
  - `worker/src/utils/s3-signer.ts:28-29`：`sortedHeaderNames = Object.keys(headers).map(k => k.toLowerCase()).sort();` + `headers[k].trim()`
  - `worker/src/storage/MinioStorage.ts:80-83`：上传传 `Content-Type` / `Content-Length` 原 case key
- 问题：签名器把 key lower-case 后再用 `headers[lower-key]` 取原对象属性，case-sensitive JS 会拿到 `undefined`，`.trim()` 抛错。
- 影响：MinIO PUT 路径（音频、语料、日志、转写结果）确定失败。
- 修复：lower-case 化输入 headers（用 `Object.fromEntries` 一次性），签名输入和取 value 用同一份 key。

### 3. P1 — K8s Deployment 引用缺失 ConfigMap key；Server 在无 MinIO 时仍 ready

- 证据：
  - `server/deploy/k8s/deployment.yaml:7-9` ConfigMap 只有 `MINIO_REGION` / `MINIO_USE_SSL`
  - `server/deploy/k8s/deployment.yaml:47-51` Deployment 必填引用 `MINIO_ENDPOINT`
  - `server/cmd/server/main.go:61-64` MinIO 未配置仍 `ready.Store(true)`
- 影响：K8s Pod 可能起不来；即使绕过配置，readiness 通过后 upload 路径解引用 `store` 会 nil panic。
- 修复：补 `MINIO_ENDPOINT`；或 readiness 反映 MinIO 真实状态；或 storage 强 nil-check + 503。

---

## PAI 派生 Explore 子审额外盲点（K12 未覆盖，高价值）

### 4. P1 — ASR 前端 ↔ Worker 协议不匹配

- 前端 `FormData` POST `/api/whisper-asr`：`frontend/src/hooks/useWhisperASR.ts:140-144`
- Worker `/api/whisper-asr` 走 `handleASRJobSubmitRequest`，要求 JSON `audioKey`：`worker/src/handlers/asr.ts:14-19`
- 路由表显式声明：“兼容旧路径” (`worker/src/index.ts:29`)
- 影响：旧路径永远拿不到同步识别结果；前端要么改协议，要么后端做兼容。
- 修复：要么后端 `/api/whisper-asr` 真的接受 multipart 并同步返回；要么前端迁到 `/api/asr/jobs` + 轮询。

### 5. P1 — TTS 前端期望音频，Worker 返回 JSON job

- 前端 `/api/tts/jobs` 与 `/api/tts/voice-clone` 请求后判 JSON 为错误：`frontend/src/hooks/useCosyVoiceTTS.ts:143-157`
- Worker 返回 `createSuccessResponse(job)` JSON：`worker/src/handlers/tts.ts:21-30`、`tts.ts:75`
- 影响：CosyVoice TTS 不会播放。
- 修复：后端 `/api/tts/jobs` 改返回音频或返回 job + `audioKey` 让前端轮询拉音频；前端逻辑也要相应改造。

### 6. P1 — Worker ASR / TTS 仍是 mock，没有真实模型调用

- `worker/src/services/ASRService.ts:105-114` `performTranscription` 返回硬编码“这是模拟的转录文本”
- `worker/src/services/TTSService.ts:172-178` `performSynthesis` 返回硬编码“模拟音频数据”
- `worker/src/services/TTSService.ts:183-188` `performVoiceCloning` 同
- 影响：表面功能完整，实际不接真实服务；README 又声明集成成功。
- 修复：mock 必须 fail loud（`501 NOT_IMPLEMENTED`），或接 `WHISPER_VPC` / `COSYVOICE_VPC`。

### 7. P1 — Worker 后台任务用 `setTimeout`，没有 `ctx.waitUntil`

- `worker/src/services/ASRService.ts:38-42`
- `worker/src/services/TTSService.ts:43-47`、`:73-76`
- `fetch(request, env)` 没接 `ExecutionContext`
- 影响：Cloudflare Worker 返回响应后 job 可能被杀，状态永远 pending。

### 8. P1 — Server 错误处理把非 200 状态码伪装成 200 success

- `server/internal/api/handler.go` 多处 `(nil, http.StatusMethodNotAllowed, nil)`
- wrapper 只在 `err != nil` 时用 status，否则永远 `Success`
- 影响：错误方法 / 缺失字段返回 200，监控与客户端全失真。

### 9. P1 — 无鉴权 + wildcard CORS 暴露日志 / 语料 / 任务接口

- Worker 路由：`worker/src/index.ts:38-47`
- CORS `*`：`worker/src/utils/index.ts:67-71`、Server `main.go:129-133`
- 影响：公开部署时任意来源可读写日志 / 语料 / 任务，对言语障碍用户产品是隐私红线。

### 10. P1 — CI 用 pnpm，但根 build script 调用 bun

- workflow：`.github/workflows/deploy.yml:19-20`（`pnpm install` + `pnpm build`）
- 根 `package.json:5-7`：`cd frontend && bun run build`
- 影响：标准 GitHub runner 没有 bun，部署直接失败。

### 11. P1 — CI 跳过 lint / test / typecheck

- `.github/workflows/deploy.yml:19-24`
- `frontend/package.json:10-13` 有 lint / test，`worker/package.json:8-10` 有 typecheck
- 影响：错误直接上线。

### 12. P1 — Server Dockerfile 引用不存在的 `go.sum`

- `server/Dockerfile:10`：`COPY go.mod go.sum ./`
- 仓库内无 `server/go.sum`
- 影响：Docker 构建失败。

### 13. P1 — Server `docker-compose` 路径解错

- `server/deploy/docker-compose.yaml:5-8`：`context: ..` + `dockerfile: server/Dockerfile` → 解析成 `server/server/Dockerfile`
- 影响：compose 构建找不到 Dockerfile。

### 14. P1 — Server 多副本部署用内存状态

- `server/internal/service/job.go:30-35`、`:89-91`、`:131-133`：jobs / logs / corpus 都在内存
- `server/deploy/k8s/deployment.yaml:28`：replicas: 2
- 影响：pod A 提交，pod B 查询即 not found；重启即丢。

---

## P2 findings（建议排进第二批修）

### 15. ASR 引擎选择 UI 没驱动实际运行时

- 证据：`frontend/src/components/ASREngineCard.tsx:53-54`、`:119`、`useASREnginePreference.ts:7-13`
- 实现总是先 POST `/api/whisper-asr` + Web Speech fallback：`useWhisperASR.ts:140`、`:216`
- 影响：选了 Gemini / browser / whisper-only 不真正生效。

### 16. ASR/TTS 测试指向旧 Supabase functions endpoint

- `frontend/src/hooks/__tests__/useWhisperASR.test.ts:220`、`useCosyVoiceTTS.test.ts:82`
- 实现路径：`useWhisperASR.ts:140`、`useCosyVoiceTTS.ts:128`、`:134`
- 影响：测试不再反映当前路由意图。

### 17. Worker middleware 注册但没执行

- `worker/src/index.ts:53-55`、`:80-82`、`worker/src/middleware.ts:22-40`
- 影响：除 `/api/tts/cloud-speech` 外，preflight 走 router miss 后落到 `env.ASSETS.fetch(request)`，CORS 行为不可控。

### 18. Worker 对静态资源强制 `.text()` 检查

- `worker/src/index.ts:82-88`
- 影响：JS/CSS/图片被额外 buffer/decode；以 `-` 开头的合法内容可能被误判 500。

### 19. MinIO 写入 key 与 job metadata 保存 key 不一致

- `worker/src/storage/MinioStorage.ts:114-117`、`:128-131`
- `worker/src/services/TTSService.ts:96-102`
- 影响：completed 之后查结果可能 404。

### 20. cf-pages 代理没接入 root deploy workflow

- `.github/workflows/deploy.yml:19-23`、`package.json:7`、`wrangler.jsonc:2-4`
- `cf-pages/_worker.js:6-20`、`cf-pages/wrangler.toml:7-9`、`cf-pages/pages.yaml:4-5`
- 影响：`cf-pages` 内配置变成 deploy-dead。

### 21. 上传路径整文件读入内存

- `server/internal/api/handler.go:106-117`、`:228-243`、`:269-279`
- `worker/src/handlers/audio.ts:21`、`worker/src/handlers/corpus.ts:35`
- 影响：可扩展性差；无 auth/rate-limit 时 DoS 风险高。

### 22. 前端 `strict: false`，API 协议漂移不被 TS 抓住

- `frontend/tsconfig.app.json:16-17`、`:25`
- 影响：以上 ASR/TTS/corpus/logs 协议漂移没有编译期 guard。

### 23. Privacy 文本与实际行为冲突

- `frontend/src/pages/DataPage.tsx:167-171` 声明数据本地存储
- `frontend/src/hooks/useCorpusCollection.ts:3-13`、`:27-59` 默认静默上传
- 影响：合规与用户同意问题。

### 24. 声纹样本以 base64 存进 localStorage

- `frontend/src/hooks/useCosyVoiceTTS.ts:33-47`、`:60-69`
- 影响：声纹可能算生物特征，本地未加密。

### 25. K8s Deployment 提交了 `stringData` 占位 Secret

- `server/deploy/k8s/deployment.yaml:12-19`
- 影响：占位 Secret 在源码里容易替换为真实凭据。

---

## 验证

- 仓库本地存在且可读：`/Users/evander/Downloads/web-app`
- Git HEAD：`dacd0c2`，`git status --short` 为空
- 本轮独立双子在 600s 内未完成；本地直接抽审已 Read 11 个关键文件并交叉验证
- 前两轮 K12 主任务均 `completed REWORK`，PAI 派生 Explore 子审返回完整高置信 findings
- 共识 findings 已在 K12 + PAI 派生 + 本地抽审三方独立确认
- 未执行依赖安装，未做远程部署，未修改仓库源文件

---

## 修复优先级建议

第一批：先救主链路与可构建性。

1. 修复 `ASREngineIndicator` 类型导入，构建先能过。
2. 修 MinIO S3 signer header 规范化，存储路径先能跑。
3. K8s 补 `MINIO_ENDPOINT`；Server readiness 反映 MinIO 状态。
4. ASR / TTS 前后端协议统一（要么同步、要么 job+轮询，二选一）。
5. Corpus / Diagnostics 路径与字段统一。
6. Server 错误处理不要把非 200 状态码包成 200。
7. Server 补 `go.sum`，修 Dockerfile / compose 路径。
8. CI 装 bun 或改 script 到 pnpm，并加 lint / test / typecheck。
9. 给日志 / 语料 / 任务接口加鉴权与限流。

第二批：架构级整改。

1. Worker job 状态改 Durable Object / KV / D1 / Queue。
2. 用 `ctx.waitUntil` 接管后台任务。
3. MinIO 写入 key 与 job metadata key 一致化。
4. Server 多副本状态外移到数据库 / Redis。
5. 上传改流式 + 大小限制。
6. 修隐私文案、声纹 localStorage、占位 Secret。
7. cf-pages 与 root deploy 流程二选一并明确。
8. 打开 TS `strict` 与 contract 测试。
