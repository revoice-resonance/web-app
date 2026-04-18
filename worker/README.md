# Project Resonance Worker

Cloudflare Worker 作为 API 网关，提供语音识别和语音合成服务。

## 功能特性

- ✅ Whisper 语音识别（通过 VPC 绑定）
- ✅ Gemini ASR 备用引擎
- ✅ CosyVoice 语音合成
- ✅ 语料收集代理
- ✅ 客户端日志收集
- ✅ CORS 支持
- ✅ 错误处理和降级策略

## 部署配置

### 环境变量设置

通过 `wrangler secret` 设置必要的环境变量：

```bash
# 设置 Gemini ASR 备用服务（可选）
wrangler secret put GEMINI_ASR_URL
wrangler secret put GEMINI_ASR_KEY
```

### VPC 绑定配置

在 `wrangler.jsonc` 中配置 VPC 服务绑定：

```json
{
  "vpc_services": [
    {
      "binding": "COSYVOICE_VPC",
      "service_id": "019d8637-dc3a-78b1-a77a-170b7ba1daa5",
      "remote": true
    },
    {
      "binding": "WHISPER_VPC", 
      "service_id": "019d8636-cd3c-78f1-aa3e-1995010552df",
      "remote": true
    }
  ]
}
```

## API 端点

| 端点 | 方法 | 功能 | 参数 |
|------|------|------|------|
| `/api/whisper-asr` | POST | 语音识别 | `multipart/form-data` 音频文件 |
| `/api/gemini-asr` | POST | Gemini ASR | `multipart/form-data` 音频文件 |
| `/api/cosyvoice-tts` | POST | 语音合成 | `multipart/form-data` 文本和参考音频 |
| `/api/corpus` | POST | 语料收集 | `multipart/form-data` 语料数据 |
| `/api/client-logs` | POST | 日志收集 | `application/json` 日志数据 |

## 开发

### 安装依赖

```bash
cd worker
npm install
```

### 本地开发

```bash
npm run dev
```

### 类型检查

```bash
npm run typecheck
```

### 部署

```bash
npm run deploy
```

## 错误处理

Worker 采用统一的错误处理策略：

1. **始终返回 HTTP 200**：避免前端出现网络错误
2. **结构化响应**：使用 `{ ok: boolean, error?: string }` 格式
3. **降级策略**：Whisper → Gemini → 浏览器原生 Speech API
4. **详细日志**：通过 `wrangler tail` 查看运行日志

## 架构说明

```
浏览器/移动端 → Cloudflare Worker → 私有 GPU 服务
    ↓              ↓                    ↓
前端应用      API 网关 + CORS      Whisper/CosyVoice
```

所有 AI 服务调用都通过 Worker 代理，确保：
- 统一的错误处理
- CORS 支持
- 服务降级
- 安全隔离