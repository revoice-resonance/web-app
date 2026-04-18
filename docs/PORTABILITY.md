# 项目可移植性指南 (Portability Guide)

本项目遵循 **Cloudflare-First, 无平台锁定** 原则。所有运行时代码不依赖 Lovable 任何 SDK、域名或专属 API。本指南说明如何把项目迁移到任意宿主环境。

---

## 架构总览

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│  浏览器/微信  │ → │ Edge / Worker    │ → │  自建 GPU 服务      │
│  (静态资源)  │    │ (反向代理 + CORS) │    │ Whisper / CosyVoice │
└─────────────┘    └──────────────────┘    └─────────────────────┘
                          │
                          └─→ Gemini ASR (官方 API，作为 fallback)
```

- **前端**：纯 React + Vite，构建产物是静态文件，可部署到任何静态宿主。
- **API 网关**：Cloudflare Worker (`worker/`) 做反向代理，通过 VPC 绑定访问内网 GPU 服务，绕过 CDN 上传大小限制。
- **AI fallback**：直连 Google AI Studio (`generativelanguage.googleapis.com`)，**不**依赖任何 AI 网关中间层。

---

## 必须的环境变量

### 前端 (Vite)
见 `.env.example`。三个全部公开安全：

| 变量 | 说明 |
|---|---|
| `VITE_SUPABASE_URL` | Supabase（或兼容服务）项目 URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon / publishable key |
| `VITE_SUPABASE_PROJECT_ID` | 项目 ref（URL 子域部分） |

### Cloudflare Worker
通过 `wrangler secret put <NAME>` 配置（**不要写入仓库**）：

| 变量 | 必填 | 说明 |
|---|---|---|
| `GEMINI_ASR_URL` | 否 | Gemini ASR 边缘函数完整 URL |
| `GEMINI_ASR_KEY` | 否 | 上面端点的 bearer token |

未设置时，Whisper 不可用就直接返回错误，不影响 worker 启动。

### Edge Functions
在 Supabase / Deno Deploy / 自托管 Deno 的 secrets 管理界面配置：

| 变量 | 必填 | 说明 |
|---|---|---|
| `GEMINI_API_KEY` | 是（gemini-asr 必需） | 从 https://aistudio.google.com/apikey 获取 |
| `WHISPER_API_URL` | 否 | 公网 Whisper 服务 URL（无 VPC 绑定时使用） |
| `COSYVOICE_API_URL` | 否 | 公网 CosyVoice 服务 URL |

---

## 迁移到其他宿主

### 方案 A: 纯 Cloudflare（推荐）
1. `wrangler login`
2. `cp .env.example .env` 并填写
3. `wrangler secret put GEMINI_ASR_URL` / `GEMINI_ASR_KEY`
4. `npm run build && wrangler deploy`

### 方案 B: Vercel / Netlify + Supabase
1. 静态资源部署到 Vercel / Netlify（设置 `VITE_*` 环境变量）。
2. Edge Functions 部署到 Supabase（`supabase functions deploy gemini-asr whisper-asr cosyvoice-tts`）。
3. 前端调用路径需从相对 `/api/*` 改为完整 Supabase URL（修改 `src/hooks/useWhisperASR.ts` 等）。

### 方案 C: 自托管（Docker + Caddy）
1. 静态资源用任意 web server 服务。
2. 用 Deno 直接运行 edge function：`deno run --allow-net --allow-env supabase/functions/gemini-asr/index.ts`
3. Nginx/Caddy 反向代理 `/api/*` 到对应 Deno 进程。

---

## 验证可移植性
- ✅ 仓库内不含 `lovable.app`、`lovable.dev`、`lovableproject.com` 域名（注释除外）。
- ✅ 不含硬编码 Supabase project ref / anon key（小程序目录例外，将单独处理）。
- ✅ `wrangler dev` 可独立运行。
- ✅ `vite build` 不依赖 Lovable 专属插件（`lovable-tagger` 仅 dev 模式启用，devDependency）。

## 已知例外
- `miniprogram/` 微信小程序代码仍含硬编码 Supabase URL（小程序无环境变量机制，待用户决定独立处理方案）。
- `lovable-tagger` 是开发期组件标注工具，不进入生产构建，不影响可移植性。
