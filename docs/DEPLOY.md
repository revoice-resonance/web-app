# Project Resonance — 部署指南

## 前置条件

- Node.js ≥ 18，pnpm 9
- Cloudflare 账户（Workers + Pages）
- CloudSpeech 账户（https://platform.cloud-speech.com）

## 首次部署（3 步）

### 1. 设置 Secret

```bash
# 安装 wrangler CLI（如已安装跳过）
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 注入 CloudSpeech API Key（ASR + TTS 共用）
wrangler secret put CLOUD_SPEECH_API_KEY
# 提示输入：sk-your-real-key-from-platform.cloud-speech.com
```

### 2. 连接 GitHub

```bash
git init
git remote add origin https://github.com/revoice-resonance/web-app
git add .
git commit -m "feat: migrate ASR and TTS to CloudSpeech cloud API"
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
cp .dev.vars.example .dev.vars   # 编辑填入 CLOUD_SPEECH_API_KEY
wrangler dev

# 启动前端
cd frontend
pnpm dev
```

## 环境变量

| 变量 | 方式 | 必须 | 默认值 |
|------|------|------|--------|
| `CLOUD_SPEECH_API_KEY` | `wrangler secret put` | ✅ | — |
| `CLOUD_SPEECH_BASE_URL` | `wrangler secret put` | — | `https://api.cloud-speech.com/v1` |
| `CLOUD_SPEECH_ASR_DEFAULT_MODEL` | `wrangler secret put` | — | `stepaudio-2.5-asr` |
| `CLOUD_SPEECH_DEFAULT_MODEL` | `wrangler secret put` | — | `step-tts-mini` |
| `CLOUD_SPEECH_DEFAULT_VOICE` | `wrangler secret put` | — | `wenrounvsheng` |

## 验证部署

```bash
# 健康检查
curl https://your-worker.workers.dev/api/cloud-speech/health
# → {"ok":true,"provider":"cloud-speech"}

# TTS 测试
curl -X POST https://your-worker.workers.dev/api/tts/cloud-speech \
  -H "Content-Type: application/json" \
  -d '{"text":"你好世界","voice":"wenrounvsheng"}' \
  --output test.mp3

# ASR 测试
curl -X POST https://your-worker.workers.dev/api/asr/cloud-speech \
  -H "Content-Type: application/json" \
  -d '{"audio":"<base64>","mimeType":"audio/webm","language":"zh"}'
```
