# Project Resonance Worker

Cloudflare Worker 作为 API 网关，提供语音识别、语音合成和语料收集等服务。

## 功能特性

- ✅ Whisper 语音识别（通过 VPC 绑定）
- ✅ Gemini ASR 备用引擎
- ✅ CosyVoice 语音合成与语音克隆
- ✅ 语料收集与管理
- ✅ 客户端日志收集与查询
- ✅ 音频上传与管理
- ✅ 任务队列管理（ASR/TTS）
- ✅ CORS 支持
- ✅ 错误处理和降级策略
- ✅ 健康检查与统计监控

## 部署配置

### 环境变量设置

通过 `wrangler secret` 设置必要的环境变量：

```bash
# 设置 Gemini ASR 备用服务（可选）
wrangler secret put GEMINI_ASR_URL
wrangler secret put GEMINI_ASR_KEY

# 设置 MinIO 对象存储配置
wrangler secret put MINIO_ACCESS_KEY
wrangler secret put MINIO_SECRET_KEY
wrangler secret put MINIO_ENDPOINT
wrangler secret put MINIO_PORT
wrangler secret put MINIO_BUCKET_NAME
wrangler secret put MINIO_USE_SSL
wrangler secret put MINIO_REGION
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
    },
    {
      "binding": "MINIO_VPC",
      "service_id": "019da135-5b1e-7c41-a592-bf81ada13ac9",
      "remote": true
    }
  ],

}
```

## API 端点

### 音频处理
| 端点 | 方法 | 功能 | 请求体 |
|------|------|------|--------|
| `/api/audio/upload` | POST | 音频上传 | `multipart/form-data` 音频文件 |

### 语音识别 (ASR)
| 端点 | 方法 | 功能 | 请求体 |
|------|------|------|--------|
| `/api/asr/jobs` | POST | 提交ASR识别任务 | `{ audioKey: string, language?: string, prefer?: string }` |
| `/api/asr/jobs/status` | GET | 查询ASR任务状态 | `?jobId={jobId}` |

### 语音合成 (TTS)
| 端点 | 方法 | 功能 | 请求体 |
|------|------|------|--------|
| `/api/tts/jobs` | POST | 提交TTS合成任务 | `{ text: string, voice?: string, speed?: number, pitch?: number }` |
| `/api/tts/voice-clone` | POST | 提交语音克隆任务 | `{ referenceAudioKey: string, text: string }` |
| `/api/tts/jobs/status` | GET | 查询TTS任务状态 | `?jobId={jobId}` |

### 语料管理
| 端点 | 方法 | 功能 | 请求体 |
|------|------|------|--------|
| `/api/corpus/upload` | POST | 语料上传 | `multipart/form-data` 包含音频、转录文本等 |
| `/api/corpus/batch-upload` | POST | 批量语料上传 | `{ corpusData: Array }` |
| `/api/corpus/query` | GET | 查询语料 | `?corpusId={}&speakerId={}&startTime={}&endTime={}&limit={}&offset={}` |
| `/api/corpus/stats` | GET | 语料统计 | - |

### 日志管理
| 端点 | 方法 | 功能 | 请求体 |
|------|------|------|--------|
| `/api/client-logs` | POST | 客户端日志上传 | `{ logs: Array }` |
| `/api/logs/client-upload` | POST | 客户端日志上传 | `{ logs: Array }` |
| `/api/logs/query` | GET | 查询日志 | `?startTime={}&endTime={}&level={}&limit={}` |
| `/api/logs/stats` | GET | 日志统计 | - |

### 系统管理
| 端点 | 方法 | 功能 | 请求体 |
|------|------|------|--------|
| `/api/health` | GET | 健康检查 | - |
| `/api/stats` | GET | 服务统计 | - |

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

Worker 采用分层架构设计：
- **API 层**：处理 HTTP 请求和响应
- **服务层**：ASR、TTS、语料、日志等服务管理
- **存储层**：MinIO/S3对象存储（生产环境首选）

注意：所有数据应使用S3/MinIO存储，不依赖KV存储。

```
浏览器/移动端 → Cloudflare Worker → 私有 GPU 服务
    ↓              ↓                    ↓
前端应用      API 网关 + 任务队列      Whisper/CosyVoice
```

所有 AI 服务调用都通过 Worker 代理，确保：
- 统一的错误处理
- CORS 支持
- 服务降级
- 安全隔离