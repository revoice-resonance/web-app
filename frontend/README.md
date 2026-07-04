# Project Resonance · 共鸣

> 专为言语障碍用户设计的智能语音训练系统

[![React](https://img.shields.io/badge/React-18.2.0-blue)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0.0-blue)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4.21-purple)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4.0-38bdf8)](https://tailwindcss.com/)
[![Accessibility](https://img.shields.io/badge/Accessibility-WCAG_2.1_AA-green)](https://www.w3.org/WAI/)

## 🌟 项目简介

**Project Resonance（共鸣）** 是一个专为言语障碍用户设计的智能语音训练系统。通过先进的语音识别和语音合成技术，帮助用户进行个性化语音训练，提升沟通能力。

### 核心功能

- 🎤 **智能语音识别** - 支持 Whisper、Gemini 多引擎识别
- 🔊 **高质量语音合成** - CosyVoice 语音克隆技术
- 📱 **跨平台支持** - Web、iOS、Android 全平台适配
- ♿ **无障碍设计** - 完整的键盘导航和屏幕阅读器支持
- 🎯 **个性化训练** - 基于用户录音的智能识别模型

## 🚀 快速开始

### 环境要求

- Node.js 18+ 
- pnpm 8+ (推荐) 或 npm 9+
- 现代浏览器 (Chrome 90+, Firefox 88+, Safari 14+)

### 安装与运行

```bash
# 克隆项目
git clone <repository-url>
cd project-resonance-src

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build
```

访问 http://localhost:8080 查看应用。

## 🏗️ 技术架构

### 前端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.2.0 | 用户界面框架 |
| TypeScript | 5.0.0 | 类型安全开发 |
| Vite | 5.4.21 | 构建工具和开发服务器 |
| Tailwind CSS | 3.4.0 | 原子化CSS框架 |
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

## 📁 项目结构

```
project-resonance-src/
├── src/                    # 前端源代码
│   ├── components/        # React组件
│   │   ├── ui/           # shadcn/ui基础组件
│   │   └── *.tsx         # 业务组件
│   ├── hooks/            # 自定义Hooks
│   ├── pages/            # 页面组件
│   ├── lib/             # 工具函数
│   └── types/           # TypeScript类型定义
├── worker/               # Cloudflare Worker
│   ├── *.ts             # API处理程序
│   └── package.json     # Worker依赖配置
├── public/               # 静态资源
│   └── docs/            # 项目文档
└── dist/                # 构建输出
```

## 🎯 核心功能

### 1. 语音训练系统

- **个性化短语库**：内置100+常用生活短语
- **渐进式训练**：基于录音数量的智能识别
- **实时反馈**：音频频谱可视化
- **质量控制**：录音回放和删除功能

### 2. 智能语音识别

- **多引擎支持**：Whisper → Gemini → 浏览器原生
- **容错机制**：自动降级和错误处理
- **实时识别**：流式语音转文字
- **置信度评估**：智能匹配算法

### 3. 语音合成技术

- **音色克隆**：基于参考音频的个性化语音
- **多参数调节**：语速、音量、音调自定义
- **高质量输出**：24kHz PCM音频流

### 4. 无障碍设计

- **键盘导航**：完整的快捷键支持
- **屏幕阅读器**：ARIA标签和语义化HTML
- **高对比度**：可访问的颜色方案
- **语音控制**：语音指令支持

## 🔧 开发指南

### 环境配置

复制环境变量模板：

```bash
cp .env.example .env
```

编辑 `.env` 文件配置必要的环境变量。

### 代码规范

项目使用 ESLint 和 Prettier 进行代码格式化：

```bash
# 代码检查
pnpm lint

# 自动修复
pnpm lint --fix
```

### 测试

```bash
# 运行测试
pnpm test

# 测试监听模式
pnpm test:watch
```

## 🚀 部署指南

### 前端部署

项目支持多种部署方式：

**Cloudflare Pages（推荐）**
```bash
pnpm build
# 上传 dist/ 目录到 Cloudflare Pages
```

**Vercel/Netlify**
```bash
pnpm build
# 连接Git仓库自动部署
```

**自托管**
```bash
pnpm build
# 将 dist/ 目录部署到任意静态服务器
```

### Worker 部署

```bash
cd worker
pnpm install
pnpm deploy

# 设置环境变量
wrangler secret put GEMINI_ASR_URL
wrangler secret put GEMINI_ASR_KEY
```

## 📊 性能优化

### 前端优化

- **代码分割**：基于路由的懒加载
- **图片优化**：WebP格式和响应式图片
- **缓存策略**：Service Worker和CDN缓存
- **包大小优化**：Tree shaking和代码压缩

### AI服务优化

- **连接复用**：VPC绑定减少网络延迟
- **请求合并**：批量处理语音识别请求
- **降级策略**：多级fallback确保服务可用性

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

## 📞 联系我们

如有问题或建议，请通过以下方式联系我们：

- 项目 Issues: [GitHub Issues](https://github.com/your-repo/issues)
- 邮箱: contact@project-resonance.org
- 文档: [项目文档](public/docs/)

---

**Project Resonance** - 让每一个声音都被听见 🔊