# StepFun TTS 接入说明

本通道独立于现有 CosyVoice (X1 本地) 路径，为 Resonance 提供云端 TTS 兜底/可选方案。

---

## 架构

```
浏览器                Worker (CF)                       StepFun
─────                 ───────────                       ────────
useStepFunTTS  ──►   POST /api/tts/stepfun  ──►        POST https://api.stepfun.com/v1/audio/speech
                     (handlers/stepfunTts.ts)          Authorization: Bearer ${STEPFUN_API_KEY}
                                                       ↓
   audio.play()  ◄── audio/mpeg binary  ◄──            mp3 binary
```

**Key 永远在 Worker 端，前端不接触。**

---

## 一次性配置

### 生产环境（Cloudflare Workers）

```bash
cd worker
wrangler secret put STEPFUN_API_KEY
# 提示后粘贴 platform.stepfun.com 的 key
```

可选覆盖（不设置走代码默认值）：
```bash
wrangler secret put STEPFUN_DEFAULT_MODEL    # 默认 step-tts-mini
wrangler secret put STEPFUN_DEFAULT_VOICE    # 默认 wenrounvsheng
wrangler secret put STEPFUN_BASE_URL         # 默认 https://api.stepfun.com/v1
```

### 本地开发（wrangler dev）

```bash
cp worker/.dev.vars.example worker/.dev.vars
# 编辑 worker/.dev.vars 填入真实 key
# .dev.vars 已加入 .gitignore，不会被提交
```

---

## 本地测试

启动 worker：
```bash
cd worker && pnpm wrangler dev
```

测试 endpoint：
```bash
curl -X POST http://localhost:8787/api/tts/stepfun \
  -H "Content-Type: application/json" \
  -d '{"text":"你好，我是阶跃星辰语音合成测试"}' \
  -o /tmp/stepfun-test.mp3 -v

afplay /tmp/stepfun-test.mp3   # macOS 试听
```

预期：返回 audio/mpeg 二进制；mp3 文件能正常播放。

---

## 前端用法

```tsx
import { useStepFunTTS } from '@/hooks/useStepFunTTS';

function MyComponent() {
  const { speak, stop, isSpeaking, error } = useStepFunTTS({
    voice: 'wenrounvsheng',  // 默认值，可省
    speed: 1.0,
  });

  return (
    <>
      <button onClick={() => speak('我替你说出来')} disabled={isSpeaking}>
        朗读
      </button>
      <button onClick={stop}>停止</button>
      {error && <span>错误: {error}</span>}
    </>
  );
}
```

---

## 推荐音色（Resonance 场景）

| voice ID | 中文名 | 适合 |
|----------|--------|------|
| `wenrounvsheng` | 温柔女声 | 默认，情感陪伴 |
| `wenrounansheng` | 温柔男声 | 情感陪伴（男性用户） |
| `linjiajiejie` | 邻家姐姐 | 亲和力强 |
| `qinqienvsheng` | 亲切女声 | 温柔带甜 |
| `shenchennanyin` | 深沉男音 | 陪伴感、有信心 |
| `cixingnansheng` | 磁性男声 | 厚重深情 |

完整列表见 https://platform.stepfun.com/docs/zh/api-reference/audio/system-voices

---

## 安全检查清单

- [x] API key 仅通过 wrangler secret / .dev.vars 注入
- [x] worker/.gitignore 排除 `.dev.vars` / `.dev.vars.local`
- [x] handler 代码不打印 key 到日志
- [x] 错误信息不回传 StepFun 原始响应体（避免泄露内部细节）
- [x] 前端代码不包含任何 key 字段或环境变量
- [ ] **首次部署后请确认：浏览器 DevTools Network 里看不到任何 sk- 开头的字符串**

---

## 与现有 CosyVoice 通道的关系

| 维度 | CosyVoice (现有) | StepFun (新增) |
|------|------------------|----------------|
| Endpoint | `/api/tts/jobs` (异步 job) | `/api/tts/stepfun` (同步) |
| Hook | `useCosyVoiceTTS` | `useStepFunTTS` |
| 后端 | X1 本地 VPC | StepFun 云 API |
| 零样本克隆 | ✅ | ❌（用 StepFun 复刻音色 API 走另一接口） |
| 计费 | 自有硬件 | StepFun 按字符 |
| 离线 | ✅ | ❌ |

两者并存，前端可按场景选择或做兜底链路。
