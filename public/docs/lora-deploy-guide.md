# 🎙️ Whisper + LoRA 微调部署指南（小白版）

> 本指南适合没有 AI 训练经验的开发者，一步步教你从零开始，为脑瘫患者定制专属语音识别模型。
> 预计总耗时：**1-2 周**（含数据采集）

> 🎮 **本指南针对 NVIDIA GeForce RTX 4090（24GB VRAM）优化**，CUDA 13.0 / Driver 580.105.08

---

## ⚡ 一键部署（推荐）

> 如果你不想手动执行每一步，直接运行一键脚本：

```bash
# 下载脚本
wget -O deploy_4090.sh https://your-app-url/docs/deploy_4090.sh

# 赋予执行权限并运行
chmod +x deploy_4090.sh
bash deploy_4090.sh
```

脚本会自动完成：安装依赖 → 检查 GPU → 训练模型（如有数据）→ 启动 FastAPI 服务

> 💡 如果想**只启动推理服务**（已有权重，跳过训练）：
> ```bash
> SKIP_TRAINING=true bash deploy_4090.sh
> ```

---

## 📋 你需要准备什么？

| 物品 | 说明 | 费用 |
|------|------|------|
| ✅ GPU 服务器 | **RTX 4090 (24GB VRAM) 已就绪**，训练速度快于 3090 约 40% | 已有 |
| 患者录音 | 50-100 条短语的语音录音 | 免费 |
| 一台电脑 | 任何系统都行，用于上传文件和操作 | 已有 |

---

## 第一步：确认服务器环境 🖥️

> 🎉 你已经拥有 **RTX 4090 (24GB VRAM)**，无需额外租用！跳过租机步骤，直接从第二步开始。

### 确认 GPU 环境

在服务器命令行运行：
```bash
nvidia-smi
```
你应该看到类似输出（已确认）：
```
NVIDIA GeForce RTX 4090 | 24564MiB | CUDA Version: 13.0
```

> ✅ 成功标志：GPU 显存 ≥ 24GB，CUDA 版本 ≥ 12.1 即可正常训练

---

## 第二步：连接到服务器 💻

服务器启动后，你会看到类似这样的信息：
```
SSH 连接：ssh -p 12345 root@123.456.789.0
密码：autodl
```

### Windows 用户
1. 下载并安装 [MobaXterm](https://mobaxterm.mobatek.net/)（免费版就行）
2. 点击 Session → SSH，填入上面的地址和端口
3. 输入密码，进入命令行

### Mac / Linux 用户
直接打开「终端」，粘贴 SSH 命令，输入密码

> ✅ 成功标志：看到命令行提示符，类似 `root@GPU服务器:~#`

---

## 第三步：安装所需工具 🔧

在服务器命令行里，**一行一行**复制粘贴以下命令：

```bash
# 1. 更新系统（等待 1-2 分钟）
apt-get update -y

# 2. 安装 Python 依赖
pip install transformers peft datasets soundfile librosa evaluate jiwer -q

# 3. 验证安装是否成功
python -c "import transformers, peft; print('✅ 安装成功！')"
```

> ✅ 成功标志：看到 `✅ 安装成功！`

---

## 第四步：上传你的录音数据 📁

### 数据格式要求
- 文件格式：**WAV**（不是 MP3！）
- 采样率：**16000 Hz**（16kHz）
- 声道：**单声道**

### 准备数据文件夹结构
在你的电脑上创建这样的文件夹：
```
我的训练数据/
├── audio/
│   ├── 001_我想喝水.wav
│   ├── 002_我想吃饭.wav
│   └── ... （50-100 个文件）
└── labels.json
```

### labels.json 的格式（用记事本编辑）
```json
[
  {"audio": "audio/001_我想喝水.wav", "text": "我想喝水"},
  {"audio": "audio/002_我想吃饭.wav", "text": "我想吃饭"},
  {"audio": "audio/003_帮我开灯.wav",  "text": "帮我开灯"}
]
```

> 💡 提示：文件名里可以带中文，但不要有空格

### 上传到服务器
使用 MobaXterm 的文件管理器（左侧面板），把整个文件夹拖进去，上传到 `/root/data/` 目录

---

## 第五步：音频格式转换（如果需要）🔄

如果你的录音是 MP3 或其他格式，运行这个脚本转换：

```bash
# 创建转换脚本
cat > /root/convert_audio.py << 'EOF'
import librosa
import soundfile as sf
import os

input_dir = "/root/data/audio_raw"   # 原始音频目录
output_dir = "/root/data/audio"      # 输出目录

os.makedirs(output_dir, exist_ok=True)

for fname in os.listdir(input_dir):
    if fname.endswith(('.mp3', '.m4a', '.wav', '.ogg')):
        path = os.path.join(input_dir, fname)
        audio, _ = librosa.load(path, sr=16000, mono=True)
        out_name = os.path.splitext(fname)[0] + '.wav'
        sf.write(os.path.join(output_dir, out_name), audio, 16000)
        print(f"✅ 转换: {fname}")

print("全部转换完成！")
EOF

python /root/convert_audio.py
```

---

## 第六步：训练模型 🚀

创建训练脚本：

```bash
cat > /root/train.py << 'EOF'
import json, os, torch
from datasets import Dataset, Audio
from transformers import WhisperProcessor, WhisperForConditionalGeneration, Seq2SeqTrainingArguments, Seq2SeqTrainer
from peft import LoraConfig, get_peft_model
import evaluate

# ── 配置区（只需修改这里）────────────────────
DATA_DIR   = "/root/data"          # 数据目录
OUTPUT_DIR = "/root/lora_output"   # 输出目录
LANGUAGE   = "zh"                  # 语言：中文
STEPS      = 500                   # 训练步数（数据少可改为 300）
# ─────────────────────────────────────────────
# 🎮 RTX 4090 优化参数：batch_size=32, bf16=True（比 fp16 更稳定）

print("📦 加载模型和处理器...")
processor = WhisperProcessor.from_pretrained("openai/whisper-small", language=LANGUAGE, task="transcribe")
model = WhisperForConditionalGeneration.from_pretrained("openai/whisper-small")

# 配置 LoRA
lora_config = LoraConfig(
    r=16, lora_alpha=32,
    target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05, bias="none"
)
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()  # 会显示只训练了 <1% 参数

# 加载数据
print("📂 加载训练数据...")
with open(f"{DATA_DIR}/labels.json") as f:
    records = json.load(f)

for r in records:
    r["audio"] = os.path.join(DATA_DIR, r["audio"])

dataset = Dataset.from_list(records).cast_column("audio", Audio(sampling_rate=16000))

def preprocess(batch):
    audio = batch["audio"]["array"]
    inputs = processor(audio, sampling_rate=16000, return_tensors="pt")
    batch["input_features"] = inputs.input_features[0]
    batch["labels"] = processor.tokenizer(batch["text"]).input_ids
    return batch

print("⚙️  预处理数据...")
dataset = dataset.map(preprocess, remove_columns=["audio", "text"])
split = dataset.train_test_split(test_size=0.1)

# 训练参数（已针对 RTX 4090 / 24GB VRAM 优化）
args = Seq2SeqTrainingArguments(
    output_dir=OUTPUT_DIR,
    per_device_train_batch_size=32,   # 4090 显存大，可用 32（3090 只能用 8）
    gradient_accumulation_steps=1,
    max_steps=STEPS,
    learning_rate=1e-3,
    warmup_steps=50,
    evaluation_strategy="steps",
    eval_steps=100,
    save_steps=100,
    logging_steps=25,
    predict_with_generate=True,
    bf16=True,                         # 4090 原生支持 BF16，比 fp16 更稳定
    report_to="none",
)

trainer = Seq2SeqTrainer(
    model=model,
    args=args,
    train_dataset=split["train"],
    eval_dataset=split["test"],
    tokenizer=processor.feature_extractor,
)

print("🚀 开始训练！（约 30 分钟）")
trainer.train()

print("💾 保存 LoRA 权重...")
model.save_pretrained(OUTPUT_DIR)
processor.save_pretrained(OUTPUT_DIR)
print(f"✅ 训练完成！权重保存在 {OUTPUT_DIR}")
EOF

python /root/train.py
```

> ⏱️ 等待约 30 分钟，你会看到训练进度和 loss 不断下降

---

## 第七步：测试模型效果 ✅

```bash
cat > /root/test.py << 'EOF'
import torch, soundfile as sf
from transformers import WhisperProcessor, WhisperForConditionalGeneration
from peft import PeftModel

MODEL_DIR = "/root/lora_output"
TEST_AUDIO = "/root/data/audio/001_我想喝水.wav"  # 换成你的测试文件

processor = WhisperProcessor.from_pretrained(MODEL_DIR)
base_model = WhisperForConditionalGeneration.from_pretrained("openai/whisper-small")
model = PeftModel.from_pretrained(base_model, MODEL_DIR)
model.eval()

audio, sr = sf.read(TEST_AUDIO)
inputs = processor(audio, sampling_rate=16000, return_tensors="pt")
with torch.no_grad():
    ids = model.generate(**inputs)
result = processor.batch_decode(ids, skip_special_tokens=True)[0]
print(f"识别结果：{result}")
EOF

python /root/test.py
```

---

## 第八步：下载 LoRA 权重文件 📥

训练完成后，把权重文件下载到你的电脑：

用 MobaXterm 文件管理器，找到 `/root/lora_output/` 文件夹，下载这些文件：
- `adapter_model.safetensors`（~8MB，最重要！）
- `adapter_config.json`
- `vocab.json`、`tokenizer.json` 等

---

## 第九步：部署推理服务 🌐

### 方案 A：继续用 AutoDL（最简单）

在同一台服务器上运行 FastAPI：

```bash
pip install fastapi uvicorn python-multipart -q

cat > /root/server.py << 'EOF'
import torch, io, soundfile as sf
from fastapi import FastAPI, UploadFile
from transformers import WhisperProcessor, WhisperForConditionalGeneration
from peft import PeftModel

app = FastAPI()

print("正在加载模型...")
processor = WhisperProcessor.from_pretrained("/root/lora_output")
base = WhisperForConditionalGeneration.from_pretrained("openai/whisper-small")
model = PeftModel.from_pretrained(base, "/root/lora_output")
model.eval()
print("模型加载完成！")

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/transcribe")
async def transcribe(file: UploadFile):
    data = await file.read()
    audio, _ = sf.read(io.BytesIO(data))
    inputs = processor(audio, sampling_rate=16000, return_tensors="pt")
    with torch.no_grad():
        ids = model.generate(**inputs)
    text = processor.batch_decode(ids, skip_special_tokens=True)[0]
    return {"text": text}
EOF

# 启动服务（保持运行，用 Ctrl+C 停止）
uvicorn server:app --host 0.0.0.0 --port 8000
```

### 获取你的服务地址

在 AutoDL 控制台，点击「自定义服务」→ 开放 8000 端口，会得到一个公网地址：
```
https://u12345-8000.proxy.xxxxxxx.com
```

---

## 第十步：连接到 App 🔗

将上面的服务地址填入 App 设置页面的「自定义 ASR 地址」：
```
https://u12345-8000.proxy.xxxxxxx.com/transcribe
```

---

## ❓ 常见问题

**Q：训练时提示 CUDA out of memory？**
A：RTX 4090 (24GB) 正常不会出现此问题。如果仍然报错，把 `per_device_train_batch_size` 从 32 改成 16

**Q：训练完识别效果还是不好？**
A：检查录音质量（是否有噪音）；尝试增加录音数量到 100 条以上；把 `STEPS` 增加到 800

**Q：BF16 和 FP16 有什么区别？**
A：RTX 4090 原生支持 BF16（bfloat16），数值范围更大、训练更稳定，不容易出现梯度爆炸。推荐使用 `bf16=True`

**Q：可以给多个患者用吗？**
A：可以！每个患者分别训练，保存不同的权重文件夹，推理时按患者 ID 加载对应权重

---

## 📊 预期效果（RTX 4090 加速版）

| 数据量 | 预期识别准确率 | 相比通用 ASR 提升 | 4090 训练耗时 |
|--------|--------------|-----------------|-------------|
| 30 条  | ~55%         | +15%            | ~8 分钟     |
| 50 条  | ~70%         | +30%            | ~12 分钟    |
| 100 条 | ~80%         | +40%            | ~20 分钟    |

> ⚡ RTX 4090 比 RTX 3090 训练速度快约 40%，batch_size 可设为 32 大幅减少总步数时间

---

## 💰 费用估算（自有 RTX 4090）

| 项目 | 费用 |
|------|------|
| 训练成本 | ✅ 免费（自有 GPU） |
| 电费（训练一次 ~20 分钟） | ~¥0.1 |
| 推理服务（7×24 小时运行） | 仅电费，约 ¥30-80/月 |

---

*Project Resonance — 共鸣项目 | 让每一个声音都被听见*
