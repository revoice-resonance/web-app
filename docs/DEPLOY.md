# Project Resonance — 部署指南

## 前置条件

- Node.js ≥ 18，pnpm 9
- Cloudflare 账户（Workers + Pages）
- Whisper ASR API 密钥 + CosyVoice TTS API 密钥

## 首次部署（3 步）

### 1. 设置 Secret

```bash
# 安装 wrangler CLI（如已安装跳过）
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 注入 Whisper ASR API Key
wrangler secret put WHISPER_API_KEY

# 注入 CosyVoice TTS API Key
wrangler secret put COSYVOICE_API_KEY
```

### 2. 连接 GitHub

```bash
git init
git remote add origin https://github.com/revoice-resonance/web-app
git add .
git commit -m "feat: restore CosyVoice TTS and Whisper ASR support"
git push -u origin master
```

### 3. 配置 GitHub Actions

在仓库 Settings → Secrets and variables → Actions 添加：

| Secret | 说明 |
|--------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（Workers 写权限） |

Push 到 master 分支即自动部署。

## 本地开发

```bash
# 安装
pnpm install

# 启动 Worker（模拟线上环境）
cd worker
cp .dev.vars.example .dev.vars   # 编辑填入 WHISPER_API_KEY + COSYVOICE_API_KEY
wrangler dev

# 启动前端
cd frontend
pnpm dev
```

## 环境变量

| 变量 | 方式 | 必须 | 默认值 |
|------|------|------|--------|
| `WHISPER_API_KEY` | `wrangler secret put` | ✅ | — |
| `COSYVOICE_API_KEY` | `wrangler secret put` | ✅ | — |
| `WHISPER_BASE_URL` | `wrangler secret put` | — | `https://api.openai.com/v1` |
| `WHISPER_ASR_DEFAULT_MODEL` | `wrangler secret put` | — | `whisper-1` |
| `COSYVOICE_BASE_URL` | `wrangler secret put` | — | `https://api.openai.com/v1` |
| `COSYVOICE_DEFAULT_MODEL` | `wrangler secret put` | — | `tts-1` |
| `COSYVOICE_DEFAULT_VOICE` | `wrangler secret put` | — | `alloy` |

## 验证部署

```bash
# 健康检查
curl https://your-worker.workers.dev/api/asr/health
# → {"ok":true}

# TTS 测试
curl -X POST https://your-worker.workers.dev/api/tts/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"你好世界","voice":"alloy"}' \
  --output test.mp3

# ASR 测试
curl -X POST https://your-worker.workers.dev/api/asr/recognize \
  -H "Content-Type: application/json" \
  -d '{"audio":"<base64>","mimeType":"audio/webm","language":"zh"}'
```