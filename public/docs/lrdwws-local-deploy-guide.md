# LRDWWS Baseline 本地部署指南

> **仓库地址**：[greeeenmouth/LRDWWS](https://github.com/greeeenmouth/LRDWWS)  
> **用途**：SLT 2024 低资源构音障碍唤醒词检测（Low-Resource Dysarthria Wake-up Word Spotting）挑战赛 Baseline  
> **底层框架**：[WeKWS](https://github.com/wenet-e2e/wekws)（WeNet 关键词检测工具包）  
> **许可证**：Apache-2.0（仅限非商业用途的对比/基准测试）

---

## 一、硬件与系统要求

| 项目 | 最低要求 | 推荐配置 |
|------|---------|---------|
| GPU | NVIDIA GPU（CUDA 11.1+） | RTX 3090 / 4090（24GB VRAM） |
| 内存 | 16GB | 32GB+ |
| 磁盘 | 20GB 空闲 | 50GB+（含数据集） |
| 系统 | Linux（Ubuntu 18.04+） | Ubuntu 20.04 / 22.04 |
| Python | 3.8 | 3.8（指定版本，不建议更高） |

> ⚠️ **Windows 用户**：建议使用 WSL2 + Ubuntu，原生 Windows 不保证兼容。

---

## 二、环境搭建（逐步执行）

### 2.1 克隆仓库

```bash
git clone https://github.com/greeeenmouth/LRDWWS.git
cd LRDWWS
```

### 2.2 创建 Conda 环境

```bash
# 创建 Python 3.8 环境（必须是 3.8，WeKWS 对版本敏感）
conda create -n lrdwws python=3.8 -y
conda activate lrdwws
```

### 2.3 安装 PyTorch（CUDA 11.1）

```bash
conda install pytorch=1.10.0 torchaudio=0.10.0 cudatoolkit=11.1 -c pytorch -c conda-forge
```

> 💡 **CUDA 版本适配**：  
> - 如果你的 GPU 驱动较新（CUDA 12.x），上述命令仍可工作（向下兼容）  
> - 如需使用更新的 PyTorch，需自行测试与 WeKWS 的兼容性  
> - 验证安装：`python -c "import torch; print(torch.cuda.is_available())"`

### 2.4 安装其他依赖

```bash
pip install -r requirements.txt
```

### 2.5 验证环境

```bash
python -c "
import torch
print(f'PyTorch: {torch.__version__}')
print(f'CUDA available: {torch.cuda.is_available()}')
if torch.cuda.is_available():
    print(f'GPU: {torch.cuda.get_device_name(0)}')
    print(f'VRAM: {torch.cuda.get_device_properties(0).total_mem / 1024**3:.1f} GB')
"
```

---

## 三、数据集准备

### 3.1 获取数据

LRDWWS 数据集需要通过挑战赛官方邮件中的下载链接获取（非公开下载）。  
联系邮箱：`lrdwws_challenge@aishelldata.com`

### 3.2 数据目录结构

将数据解压后放在 **项目根目录**，确保如下结构：

```
LRDWWS/
├── lrdwws/                    ← 数据集根目录
│   ├── dev/
│   │   ├── Intelligibility.xlsx   ← 说话人可懂度评分
│   │   ├── README.txt
│   │   ├── enrollment/            ← 个性化注册数据
│   │   │   ├── transcript/        ← 文本标注
│   │   │   └── wav/               ← 音频文件
│   │   └── eval/                  ← 评估数据
│   │       ├── transcript/
│   │       └── wav/
│   └── train/
│       ├── Control/               ← 健康人语音（正常对照组）
│       │   ├── transcript/
│       │   └── wav/
│       ├── Intelligibility.xlsx
│       ├── README.txt
│       └── Uncontrol/             ← 构音障碍患者语音
│           ├── transcript/
│           └── wav/
├── examples/
│   └── lrd/
│       └── s0/                    ← 训练脚本所在目录
├── wekws/                         ← WeKWS 核心代码
├── tools/                         ← 工具脚本
└── docs/                          ← 文档
```

### 3.3 数据说明

| 数据集 | 内容 | 用途 |
|--------|------|------|
| `train/Control` | 健康人唤醒词+非唤醒词语音 | 阶段 1：训练说话人无关的基线模型 |
| `train/Uncontrol` | 构音障碍患者语音 | 阶段 2：微调为障碍语音通用模型 |
| `dev/enrollment` | 目标用户少量注册语音（约 3 分钟） | 阶段 3：个性化适配 |
| `dev/eval` | 目标用户测试语音 | 评估最终唤醒性能 |

---

## 四、三阶段训练流程

核心思想：**渐进式迁移学习**（正常语音 → 障碍语音通用 → 个人定制）

```
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│  阶段 1: SIC    │────▶│  阶段 2: SID    │────▶│  阶段 3: SDD    │
│  正常对照训练    │     │  障碍语音微调    │     │  个人注册适配    │
│  (从零开始)      │     │  (迁移学习)      │     │  (少样本微调)    │
└────────────────┘     └────────────────┘     └────────────────┘
```

### 4.1 进入工作目录

```bash
cd examples/lrd/s0
```

### 4.2 阶段 1 — 训练 SIC 模型（说话人无关 · 正常语音）

```bash
bash run_control.sh --stage 0 --stop_stage 3
```

**各 stage 含义**：
| Stage | 操作 | 说明 |
|-------|------|------|
| 0 | 数据准备 | 生成 wav.scp、text 等 Kaldi 格式文件 |
| 1 | 特征提取 | 提取 Fbank 特征 |
| 2 | 模型训练 | 使用 Control 数据从零训练 KWS 模型 |
| 3 | 模型测试 | 计算 FAR / FRR / Score |

> ⏳ **预计耗时**：RTX 4090 约 30-60 分钟（取决于数据量）

### 4.3 阶段 2 — 微调 SID 模型（说话人无关 · 障碍语音）

```bash
bash run_uncontrol.sh --stage 0 --stop_stage 3
```

此步骤加载阶段 1 的 SIC 权重，使用 `train/Uncontrol` 数据继续微调。

### 4.4 阶段 3 — 个性化 SDD 模型（说话人相关 · 目标用户）

```bash
bash run_enrollment.sh --stage 0 --stop_stage 3
```

此步骤为 **每个目标用户** 独立微调一个模型：
- 使用 `dev/enrollment` 中该用户的少量注册语音
- 在 `dev/eval` 上评估 FAR / FRR / Score

---

## 五、单独运行某个 Stage

如果某个 stage 失败，可以单独重跑：

```bash
# 仅运行数据准备（stage 0）
bash run_control.sh --stage 0 --stop_stage 0

# 仅运行训练（stage 2）
bash run_control.sh --stage 2 --stop_stage 2

# 仅运行测试（stage 3）
bash run_control.sh --stage 3 --stop_stage 3
```

---

## 六、评估指标

| 指标 | 定义 | 目标 |
|------|------|------|
| **FAR** | 误唤醒率（False Alarm Rate） | 越低越好 |
| **FRR** | 拒识率（False Rejection Rate） | 越低越好 |
| **Score** | FAR + FRR | 越低越好（排名依据） |

### Baseline 参考结果（dev set）

| 说话人 | 可懂度 | FAR | FRR | Score |
|--------|-------|-----|-----|-------|
| DF0016 | 93.73 | 0.053 | 0.050 | 0.103 |
| DM0005 | 85.78 | 0.019 | 0.125 | 0.144 |
| DF0015 | 68.44 | 0.035 | 0.075 | 0.110 |
| DM0019 | 47.95 | 0.069 | 0.175 | 0.244 |

> 📊 **规律**：可懂度越低的说话人，Score 越高（识别越困难）

---

## 七、常见问题与排错

### Q1: `conda install pytorch` 找不到包
```bash
# 使用 pip 替代
pip install torch==1.10.0+cu111 torchaudio==0.10.0+cu111 -f https://download.pytorch.org/whl/cu111/torch_stable.html
```

### Q2: `CUDA out of memory`
- 在对应的 `run_*.sh` 中找到 `--batch_size` 参数，减小到 8 或 4
- 或在训练配置中启用 `gradient_accumulation_steps`

### Q3: `FileNotFoundError: wav.scp`
- 确认数据已解压到 `lrdwws/` 目录
- 确认 `stage 0`（数据准备）已成功运行

### Q4: `ModuleNotFoundError`
```bash
conda activate lrdwws
pip install -r requirements.txt
```

### Q5: 测试阶段阈值选择
Baseline 会输出不同阈值下的 FAR/FRR。在实际挑战中，每条音频只允许一个预测结果，需要自行选择最优阈值。建议：
- 在 dev set 上用网格搜索找到使 Score 最小的阈值
- 注意：挑战赛评估脚本与 baseline 测试脚本的评判逻辑略有不同

---

## 八、与 Project Resonance 的整合思路

LRDWWS Baseline 的三阶段训练范式可直接指导本项目的工作：

| LRDWWS 阶段 | Project Resonance 对应 | 行动建议 |
|-------------|----------------------|---------|
| SIC（正常语音预训练） | 使用 AISHELL-1/2 数据预训练基线 | 已有 Whisper 可替代 |
| SID（障碍语音微调） | 使用已收集的 4,944 条录音微调 | 参考 `lora-deploy-guide.md` |
| SDD（个人适配） | 用户 3 分钟注册语料个性化 | 对接 App 录音功能 |

### 关键技术借鉴

1. **数据流水线**：WeKWS 的 `wav.scp` + `text` 格式可作为数据规范参考
2. **评估标准**：FAR + FRR = Score 评估框架可用于我们的唤醒词检测
3. **阈值优化**：每说话人独立调阈值，而非使用全局阈值
4. **可懂度分层**：按说话人可懂度分组评估，暴露模型弱点

---

## 九、快速启动清单

```bash
# 1. 克隆
git clone https://github.com/greeeenmouth/LRDWWS.git && cd LRDWWS

# 2. 环境
conda create -n lrdwws python=3.8 -y && conda activate lrdwws
conda install pytorch=1.10.0 torchaudio=0.10.0 cudatoolkit=11.1 -c pytorch -c conda-forge
pip install -r requirements.txt

# 3. 放置数据到 lrdwws/ 目录

# 4. 三阶段训练
cd examples/lrd/s0
bash run_control.sh --stage 0 --stop_stage 3      # 阶段 1
bash run_uncontrol.sh --stage 0 --stop_stage 3     # 阶段 2
bash run_enrollment.sh --stage 0 --stop_stage 3    # 阶段 3

# 5. 查看结果
# 结果将输出每个说话人的 FAR / FRR / Score
```
