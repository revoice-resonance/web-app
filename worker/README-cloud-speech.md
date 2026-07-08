# CosyVoice TTS + Whisper ASR 接入说明

## 架构总览

```
浏览器                Worker (CF)                       上游
──────                ───────────                       ────

useCloudTTS ──►   POST /api/tts/speak  ──►      POST /v1/audio/speech
                   (handlers/cloudTts.ts)         Authorization: Bearer ${COSYVOICE_API_KEY}

useCloudASR ──►   POST /api/asr/recognize  ──►   POST /v1/audio/asr
                   (handlers/cloudAsr.ts)         Authorization: Bearer ${WHISPER_API_KEY}
```

## 快速开始

### 1. 注入 API Key

```bash
# Whisper ASR API Key
wrangler secret put WHISPER_API_KEY
# 提示后粘贴 Whisper API Key

# CosyVoice TTS API Key
wrangler secret put COSYVOICE_API_KEY
# 提示后粘贴 CosyVoice API Key
```

### 2. 可选覆盖（通过 wrangler secret put）

```bash
wrangler secret put WHISPER_BASE_URL           # 默认 https://api.openai.com/v1
wrangler secret put WHISPER_ASR_DEFAULT_MODEL  # 默认 whisper-1
wrangler secret put COSYVOICE_BASE_URL         # 默认 https://api.openai.com/v1
wrangler secret put COSYVOICE_DEFAULT_MODEL    # 默认 tts-1
wrangler secret put COSYVOICE_DEFAULT_VOICE    # 默认 alloy
```

### 3. 本地开发

```bash
cp worker/.dev.vars.example worker/.dev.vars
# 编辑 worker/.dev.vars 填入实际值
cd worker && wrangler dev
```

### 4. 测试

```bash
# TTS 测试
curl -X POST http://localhost:8787/api/tts/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"你好世界","model":"tts-1","voice":"alloy","response_format":"mp3"}' \
  -o /tmp/tts-test.mp3 -v

# ASR 测试
curl -X POST http://localhost:8787/api/asr/health
```

### 5. 前端调用

```ts
import { useCloudTTS } from '@/hooks/useCloudTTS';
import { useCloudASR } from '@/hooks/useCloudASR';

const { speak, stop, isSpeaking, error } = useCloudTTS({
  voice: 'alloy',
  model: 'tts-1',
});

const { transcribe, finalText, error } = useCloudASR();
```

## TTS 系统音色

| ID | 描述 |
|----|------|
| alloy | 中性女声 |
| echo | 温和男声 |
| fable | 英式男声 |
| onyx | 深沉男声 |
| nova | 温柔女声 |
| shimmer | 清晰女声 |

## 安全

- [x] API Key 通过 `wrangler secret put` 注入，不写进代码或配置文件
- [x] 错误信息不回传上游原始响应体（避免泄露内部细节）
- [x] 401 映射为 503（不泄露鉴权状态给客户端）
- [x] Worker 日志仅记录无害摘要（model、textLength、audioBytes、elapsedMs）

## 迁移说明

当前栈为 **CosyVoice TTS + Whisper ASR**，通过 Cloudflare Worker 代理转发至标准 OpenAI 兼容 API。之前使用的第三方方案已不再维护，无需关注。