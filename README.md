# Project Resonance（共鸣）

> 专为言语障碍用户设计的智能语音训练系统

[![React](https://img.shields.io/badge/React-18.3.1-blue)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4.19-purple)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4.17-38bdf8)](https://tailwindcss.com/)

## 🌟 项目简介

**Project Resonance（共鸣）** 是一个专为言语障碍用户设计的智能语音训练系统。通过先进的语音识别和语音合成技术，帮助用户进行个性化语音训练，提升沟通能力。

## 📁 项目结构

```
project-resonance-src/
├── frontend/                 # 前端 React 应用
│   ├── src/
│   │   ├── components/      # React 组件
│   │   ├── hooks/           # 自定义 Hooks
│   │   ├── pages/           # 页面组件
│   │   ├── lib/             # 工具函数
│   │   └── types/           # TypeScript 类型定义
│   ├── public/              # 静态资源
│   └── package.json         # 前端依赖配置
├── worker/                   # Cloudflare Worker API 网关
│   ├── src/
│   │   ├── services/        # 核心服务模块
│   │   ├── storage/         # 存储管理模块
│   │   ├── types/           # 类型定义
│   │   └── utils/           # 工具函数
│   ├── wrangler.jsonc       # Cloudflare Worker 配置
│   └── package.json         # Worker 依赖配置
└── README.md                 # 项目说明文档
```

## 🚀 快速开始

### 环境要求

- Node.js 18+ 
- pnpm 8+ (推荐) 或 npm 9+
- 现代浏览器 (Chrome 90+, Firefox 88+, Safari 14+)

### 安装与运行

#### 前端应用

```bash
# 进入前端目录
cd frontend

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build
```

访问 http://localhost:8080 查看应用。

#### Cloudflare Worker

```bash
# 进入worker目录
cd worker

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 部署到Cloudflare
pnpm deploy
```

## 🎯 核心功能

- 🎤 **智能语音识别** - Whisper + Gemini 多引擎 ASR，支持降级 fallback
- 🔊 **语音合成与克隆** - CosyVoice 高质量 TTS
- 📱 **跨平台支持** - Web + iOS/Android 原生应用
- ♿ **无障碍设计** - WCAG 2.1 AA 合规，键盘导航 + 屏幕阅读器优化
- 🎯 **个性化训练** - 基于用户录音数据优化识别准确率

## 🏗️ 技术架构

### 前端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.3.1 | 用户界面框架 |
| TypeScript | 5.8.3 | 类型安全开发 |
| Vite | 5.4.19 | 构建工具和开发服务器 |
| Tailwind CSS | 3.4.17 | 原子化CSS框架 |
| Radix UI | 1.2.x | 无障碍基础组件 |
| shadcn/ui | - | 基于 Radix UI 的 UI 组件 |

### AI 服务集成

| 服务 | 功能 | 说明 |
|------|------|------|
| Whisper | 语音识别 | 主要识别引擎，通过VPC绑定 |
| Gemini | 备用ASR | Google AI Studio API |
| CosyVoice | 语音合成 | 高质量语音克隆技术 |
| 浏览器Speech API | 最终备用 | 原生语音识别支持 |

### 部署架构

```
浏览器/移动端 (React + TS)
        │
        ▼
Cloudflare Worker (API网关 + 反向代理)
        │
        ├──► 私有GPU服务 (Whisper / CosyVoice)
        │         │
        │         ▼
        │    MinIO 存储
        │
        └──► Gemini API (备用识别引擎)
             │
             ▼
        localStorage (用户数据管理)
```

### Worker 服务功能

Cloudflare Worker 作为 API 网关，提供以下核心服务：

- **音频处理** - 音频上传、存储管理
- **语音识别 (ASR)** - Whisper 主引擎，Gemini 备用引擎
- **语音合成 (TTS)** - CosyVoice 语音合成与克隆
- **语料管理** - 语料收集、存储、查询
- **任务队列** - ASR/TTS 任务管理
- **日志收集** - 客户端日志上传与查询

Worker通过VPC服务连接到私有GPU服务，提供Whisper语音识别、CosyVoice语音合成和MinIO存储服务。

## 📊 性能优化

- **首包优化**：前端包体积减少 57%
- **路由懒加载**：基于路由的代码分割
- **缓存策略**：Service Worker + CDN 缓存
- **连接稳定性**：ASR 错误自动恢复机制
- **内存管理**：P0-P2 级别内存泄漏修复

## 🤝 贡献指南

我们欢迎社区贡献！请遵循以下步骤：

1. Fork 项目仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

### 开发规范

- 使用 TypeScript 进行类型安全开发
- 遵循无障碍设计原则 (WCAG 2.1 AA)
- 编写单元测试覆盖核心功能
- 更新相关文档

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

感谢以下开源项目和技术的支持：

- [OpenAI Whisper](https://github.com/openai/whisper) - 语音识别技术
- [Google Gemini](https://ai.google.dev/) - AI语言模型
- [CosyVoice](https://cosyvoice.org/) - 语音合成技术
- [Cloudflare Workers](https://workers.cloudflare.com/) - 边缘计算平台
- [Radix UI](https://www.radix-ui.com/) - 无障碍组件库

---

**Project Resonance** - 让每一个声音都被听见 🔊