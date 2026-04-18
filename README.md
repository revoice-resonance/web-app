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
│   ├── src/                  # 前端源代码
│   │   ├── components/      # React组件
│   │   ├── hooks/           # 自定义Hooks
│   │   ├── pages/           # 页面组件
│   │   ├── lib/             # 工具函数
│   │   └── types/           # TypeScript类型定义
│   ├── public/              # 静态资源
│   └── package.json         # 前端依赖配置
├── worker/                   # Cloudflare Worker API网关
│   ├── src/                  # Worker源代码
│   │   ├── services/        # 核心服务模块
│   │   ├── storage/         # 存储管理模块  
│   │   ├── types/           # 类型定义
│   │   └── utils/           # 工具函数
│   ├── wrangler.jsonc       # Cloudflare Worker 配置文件
│   └── package.json         # Worker依赖配置
└── README.md                # 项目说明文档
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

- 🎤 **智能语音识别** - 支持 Whisper、Gemini 多引擎识别
- 🔊 **高质量语音合成** - CosyVoice 语音克隆技术
- 📱 **跨平台支持** - Web、iOS、Android 全平台适配
- ♿ **无障碍设计** - 完整的键盘导航和屏幕阅读器支持
- 🎯 **个性化训练** - 基于用户录音的智能识别模型

## 🏗️ 技术架构

### 前端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.3.1 | 用户界面框架 |
| TypeScript | 5.8.3 | 类型安全开发 |
| Vite | 5.4.19 | 构建工具和开发服务器 |
| Tailwind CSS | 3.4.17 | 原子化CSS框架 |
| shadcn/ui | 最新 | 现代化UI组件库 |
| Radix UI | 最新 | 无障碍基础组件 |

### AI 服务集成

| 服务 | 功能 | 说明 |
|------|------|------|
| Whisper | 语音识别 | 主要识别引擎，通过VPC绑定 |
| Gemini | 备用ASR | Google AI Studio API |
| CosyVoice | 语音合成 | 高质量语音克隆技术 |
| 浏览器Speech API | 最终备用 | 原生语音识别支持 |

### 部署架构

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│  浏览器/移动端  │ → │ Cloudflare Worker │ → │  私有GPU服务         │
│  (React + TS) │    │ (API网关 + 反向代理) │    │ Whisper / CosyVoice  │
└─────────────┘    └──────────────────┘    └─────────────────────┘
     ↓ 本地存储           ↓ 可选fallback           ↓ 主要AI引擎
┌─────────────┐    ┌──────────────────┐
│ localStorage │    │ Gemini API       │
│ 用户数据管理   │    │ (备用识别引擎)    │
└─────────────┘    └──────────────────┘
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

- **代码分割**：基于路由的懒加载
- **图片优化**：WebP格式和响应式图片
- **缓存策略**：Service Worker和CDN缓存
- **包大小优化**：Tree shaking和代码压缩

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