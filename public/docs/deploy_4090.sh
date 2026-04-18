#!/bin/bash
# =============================================================
# 🚀 Project Resonance — RTX 4090 One-Click Deploy Script
# =============================================================
# 适用环境：NVIDIA RTX 4090 (24GB VRAM) | CUDA 13.0 | Ubuntu 22.04
# 用法：bash deploy_4090.sh
# =============================================================

set -e  # 遇到错误立即退出

# ── 颜色输出 ─────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info()    { echo -e "${CYAN}[INFO]${NC}  $1"; }
log_ok()      { echo -e "${GREEN}[✅ OK]${NC}  $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ── 配置（按需修改）──────────────────────────────────────────
MODEL_DIR="${MODEL_DIR:-/root/lora_output}"     # LoRA 权重目录
DATA_DIR="${DATA_DIR:-/root/data}"              # 训练数据目录
SERVER_PORT="${SERVER_PORT:-8000}"              # 推理服务端口
TRAIN_STEPS="${TRAIN_STEPS:-500}"              # 训练步数
BATCH_SIZE="${BATCH_SIZE:-32}"                 # RTX 4090 推荐 batch=32
BASE_MODEL="${BASE_MODEL:-openai/whisper-small}" # 基础模型
# ─────────────────────────────────────────────────────────────

echo ""
echo "=================================================="
echo "  🎙️  Project Resonance · RTX 4090 部署脚本"
echo "=================================================="
echo ""

# ──────────────────────────────────────────────────────────────
# 步骤 1：检查 GPU 环境
# ──────────────────────────────────────────────────────────────
log_info "步骤 1/6：检查 GPU 环境..."

if ! command -v nvidia-smi &> /dev/null; then
    log_error "未找到 nvidia-smi，请确认 GPU 驱动已安装"
fi

GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)
GPU_MEM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)
CUDA_VER=$(nvidia-smi | grep "CUDA Version" | awk '{print $NF}')

echo "   GPU:  $GPU_NAME"
echo "   显存: ${GPU_MEM} MiB"
echo "   CUDA: $CUDA_VER"

if [[ $GPU_MEM -lt 20000 ]]; then
    log_warn "显存不足 20GB，已自动将 batch_size 降至 8"
    BATCH_SIZE=8
fi

log_ok "GPU 检查通过"

# ──────────────────────────────────────────────────────────────
# 步骤 2：安装依赖
# ──────────────────────────────────────────────────────────────
log_info "步骤 2/6：安装 Python 依赖（首次运行约 3-5 分钟）..."

pip install -q \
    transformers \
    peft \
    datasets \
    soundfile \
    librosa \
    evaluate \
    jiwer \
    fastapi \
    "uvicorn[standard]" \
    python-multipart \
    accelerate

log_ok "依赖安装完成"

# ──────────────────────────────────────────────────────────────
# 步骤 3：检查数据
# ──────────────────────────────────────────────────────────────
log_info "步骤 3/6：检查训练数据..."

if [ ! -d "$DATA_DIR" ]; then
    log_warn "数据目录 $DATA_DIR 不存在，跳过训练步骤（仅部署推理服务）"
    SKIP_TRAINING=true
elif [ ! -f "$DATA_DIR/labels.json" ]; then
    log_warn "未找到 $DATA_DIR/labels.json，跳过训练步骤"
    SKIP_TRAINING=true
else
    RECORD_COUNT=$(python3 -c "import json; d=json.load(open('$DATA_DIR/labels.json')); print(len(d))")
    echo "   找到 $RECORD_COUNT 条训练样本"
    if [[ $RECORD_COUNT -lt 10 ]]; then
        log_warn "训练样本少于 10 条，识别效果可能较差，建议至少准备 50 条"
    fi
    log_ok "数据检查完成"
    SKIP_TRAINING=false
fi

# ──────────────────────────────────────────────────────────────
# 步骤 4：训练模型（如有数据）
# ──────────────────────────────────────────────────────────────
if [ "$SKIP_TRAINING" = false ] && [ ! -f "$MODEL_DIR/adapter_config.json" ]; then
    log_info "步骤 4/6：开始 LoRA 训练（RTX 4090 约 15-20 分钟）..."

    python3 - <<PYEOF
import json, os, torch
from datasets import Dataset, Audio
from transformers import (
    WhisperProcessor, WhisperForConditionalGeneration,
    Seq2SeqTrainingArguments, Seq2SeqTrainer
)
from peft import LoraConfig, get_peft_model

DATA_DIR   = "$DATA_DIR"
OUTPUT_DIR = "$MODEL_DIR"
LANGUAGE   = "zh"
STEPS      = $TRAIN_STEPS
BATCH_SIZE = $BATCH_SIZE

print(f"📦 加载基础模型: $BASE_MODEL")
processor = WhisperProcessor.from_pretrained("$BASE_MODEL", language=LANGUAGE, task="transcribe")
model = WhisperForConditionalGeneration.from_pretrained("$BASE_MODEL")

# RTX 4090 优化：使用 BF16
if torch.cuda.is_bf16_supported():
    model = model.to(torch.bfloat16)
    print("🎮 使用 BF16 精度（RTX 4090 原生支持）")

# LoRA 配置
lora_config = LoraConfig(
    r=16, lora_alpha=32,
    target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05, bias="none"
)
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()

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

# 训练参数（RTX 4090 优化）
args = Seq2SeqTrainingArguments(
    output_dir=OUTPUT_DIR,
    per_device_train_batch_size=BATCH_SIZE,  # 4090: 32
    gradient_accumulation_steps=1,
    max_steps=STEPS,
    learning_rate=1e-3,
    warmup_steps=50,
    evaluation_strategy="steps",
    eval_steps=100,
    save_steps=100,
    logging_steps=25,
    predict_with_generate=True,
    bf16=torch.cuda.is_bf16_supported(),     # 4090 用 BF16
    fp16=not torch.cuda.is_bf16_supported(), # 老卡用 FP16 兜底
    report_to="none",
    dataloader_num_workers=4,                # 4090 多线程加速数据加载
)

trainer = Seq2SeqTrainer(
    model=model,
    args=args,
    train_dataset=split["train"],
    eval_dataset=split["test"],
    tokenizer=processor.feature_extractor,
)

print(f"🚀 开始训练！batch_size={BATCH_SIZE}, steps={STEPS}")
trainer.train()

print("💾 保存 LoRA 权重...")
model.save_pretrained(OUTPUT_DIR)
processor.save_pretrained(OUTPUT_DIR)
print(f"✅ 训练完成！权重已保存至 {OUTPUT_DIR}")
PYEOF

    log_ok "模型训练完成"
else
    if [ "$SKIP_TRAINING" = true ]; then
        log_warn "步骤 4/6：跳过训练（无数据）"
    else
        log_ok "步骤 4/6：发现已有权重，跳过训练（删除 $MODEL_DIR 可重新训练）"
    fi
fi

# ──────────────────────────────────────────────────────────────
# 步骤 5：生成 FastAPI 推理服务
# ──────────────────────────────────────────────────────────────
log_info "步骤 5/6：生成 FastAPI 推理服务..."

cat > /root/server.py << 'SERVEREOF'
"""
Project Resonance — FastAPI 推理服务
RTX 4090 优化版：BF16 推理 + 并发请求队列
"""
import io, torch, asyncio, logging
import soundfile as sf
from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from transformers import WhisperProcessor, WhisperForConditionalGeneration
from peft import PeftModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Project Resonance ASR", version="1.0.0")

# 允许跨域（供 App 调用）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

MODEL_DIR = "/root/lora_output"
BASE_MODEL = "openai/whisper-small"

# 全局模型（启动时加载一次）
processor = None
model = None
_semaphore = asyncio.Semaphore(4)  # 最多 4 个并发请求

@app.on_event("startup")
async def load_model():
    global processor, model
    logger.info("🔄 正在加载模型...")
    try:
        processor = WhisperProcessor.from_pretrained(MODEL_DIR)
        base = WhisperForConditionalGeneration.from_pretrained(BASE_MODEL)
        model = PeftModel.from_pretrained(base, MODEL_DIR)
        model.eval()
        # RTX 4090：使用 BF16 推理，速度更快
        if torch.cuda.is_available():
            dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
            model = model.to("cuda", dtype=dtype)
            logger.info(f"✅ 模型已加载至 GPU，精度: {dtype}")
        else:
            logger.warning("⚠️  未检测到 GPU，使用 CPU 推理（速度较慢）")
    except Exception as e:
        logger.error(f"❌ 模型加载失败: {e}")
        raise

@app.get("/health")
def health():
    gpu_info = {}
    if torch.cuda.is_available():
        gpu_info = {
            "gpu": torch.cuda.get_device_name(0),
            "memory_used_mb": round(torch.cuda.memory_allocated(0) / 1024**2, 1),
            "memory_total_mb": round(torch.cuda.get_device_properties(0).total_memory / 1024**2, 1),
        }
    return {"status": "ok", "model_loaded": model is not None, **gpu_info}

@app.post("/transcribe")
async def transcribe(file: UploadFile):
    if not file.content_type or not any(
        t in file.content_type for t in ["audio", "octet-stream", "multipart"]
    ):
        raise HTTPException(400, "请上传音频文件（WAV/WebM/MP3）")

    async with _semaphore:
        try:
            data = await file.read()
            audio, sr = sf.read(io.BytesIO(data))

            # 自动重采样至 16kHz
            if sr != 16000:
                import librosa
                audio = librosa.resample(audio, orig_sr=sr, target_sr=16000)

            device = "cuda" if torch.cuda.is_available() else "cpu"
            inputs = processor(audio, sampling_rate=16000, return_tensors="pt").to(device)

            with torch.no_grad():
                ids = model.generate(**inputs, language="zh", task="transcribe")

            text = processor.batch_decode(ids, skip_special_tokens=True)[0].strip()
            logger.info(f"识别结果: {text}")
            return {"text": text, "success": True}

        except Exception as e:
            logger.error(f"识别失败: {e}")
            raise HTTPException(500, f"识别失败: {str(e)}")
SERVEREOF

log_ok "FastAPI 服务文件已生成 → /root/server.py"

# ──────────────────────────────────────────────────────────────
# 步骤 6：启动服务
# ──────────────────────────────────────────────────────────────
log_info "步骤 6/6：启动推理服务..."

echo ""
echo "=================================================="
echo -e "  ${GREEN}🎉 部署完成！${NC}"
echo "=================================================="
echo ""
echo "  服务地址:  http://0.0.0.0:${SERVER_PORT}"
echo "  健康检查:  http://localhost:${SERVER_PORT}/health"
echo "  识别接口:  POST http://localhost:${SERVER_PORT}/transcribe"
echo ""
echo "  在 App 设置中填写:"
echo -e "  ${YELLOW}http://<你的服务器IP>:${SERVER_PORT}/transcribe${NC}"
echo ""
echo "  停止服务: Ctrl + C"
echo "=================================================="
echo ""

uvicorn server:app \
    --host 0.0.0.0 \
    --port "$SERVER_PORT" \
    --workers 1 \
    --log-level info
