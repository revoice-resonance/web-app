# 共鸣 Project Resonance — 微信小程序 WebView 部署指南

## 📋 架构概述

```
┌─────────────────────┐     ┌─────────────────────┐
│  微信小程序壳        │     │  Web 应用 (React)    │
│  miniprogram/       │────▶│  部署在可访问服务器   │
│  └─ web-view 组件   │     │  (Vercel/腾讯云等)   │
└─────────────────────┘     └──────────┬──────────┘
                                       │
                            ┌──────────▼──────────┐
                            │  后端 Edge Functions │
                            │  (ASR / TTS / Clone) │
                            └─────────────────────┘
```

## 🚀 部署步骤

### 第 1 步：构建 Web 应用

```bash
# 在项目根目录执行
npm run build
```

构建产物在 `dist/` 目录中。

### 第 2 步：部署 Web 应用到可访问的服务器

#### 方案 A：Vercel（最快，推荐比赛演示）

1. 将项目导出到 GitHub（Lovable 右上角 → Export to GitHub）
2. 登录 [vercel.com](https://vercel.com)，导入该 GitHub 仓库
3. 设置环境变量：
   - `VITE_SUPABASE_URL` = 你的后端地址
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = 你的 anon key
4. 部署后获得域名如 `resonance-xxx.vercel.app`

#### 方案 B：百度云 BOS 静态托管（推荐国内访问）

1. 登录 [百度智能云控制台](https://console.bce.baidu.com)，创建 BOS 存储桶
2. 在存储桶设置中开启 **静态网站托管**
3. 上传 `dist/` 目录所有文件到存储桶根目录
4. 如有自定义域名，在 BOS → 域名管理中绑定并配置 CNAME
5. 获取访问域名（如 `your-bucket.bj.bcebos.com` 或自定义域名）
6. 设置环境变量（如果构建时需要）：
   - `VITE_SUPABASE_URL` = 后端地址
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = anon key

#### 方案 C：腾讯云 COS 静态托管

1. 创建腾讯云 COS 存储桶，开启静态网站托管
2. 上传 `dist/` 目录所有文件
3. 获取访问域名

#### 方案 D：GitHub Pages

1. 导出到 GitHub
2. 在仓库 Settings → Pages 开启，选择 `gh-pages` 分支
3. 域名格式：`username.github.io/repo-name`

### 第 3 步：配置小程序项目

1. 打开 `miniprogram/project.config.json`，将 `appid` 替换为你的小程序 AppID
2. 打开 `miniprogram/app.js`，将 `webviewUrl` 替换为第 2 步获得的部署域名：

```javascript
globalData: {
  webviewUrl: 'https://your-deployed-domain.com'
}
```

### 第 4 步：在微信开发者工具中测试

1. 下载 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 导入 `miniprogram/` 目录作为小程序项目
3. **关键**：在开发者工具中勾选 `不校验合法域名`（Settings → Project Settings）
4. 点击编译预览

### 第 5 步：提交比赛

1. 在开发者工具中点击 "上传" 提交代码
2. 登录 [小程序管理后台](https://mp.weixin.qq.com) 提交审核（比赛通道通常免审核）

## ⚠️ 重要注意事项

### 关于域名校验
- **开发/测试阶段**：在微信开发者工具中关闭域名校验即可
- **正式发布**：需要在小程序管理后台 → 开发管理 → 服务器域名 中配置「业务域名」
- **比赛演示**：通常用开发版或体验版，无需正式域名校验

### 关于录音功能
WebView 内的 `getUserMedia`（麦克风录音）在微信小程序中**可能不被支持**。  

如果录音不可用，有两个降级方案：
1. **演示模式**：预录一段音频用于演示 ASR 流程
2. **JSSDK 桥接**：用小程序原生 `RecorderManager` 录音，通过 `postMessage` 传给 WebView

### 关于网络
后端 Edge Functions 部署在海外，中国访问可能有延迟。比赛演示时建议：
- 提前测试网络连通性
- 准备一个离线演示视频作为备案

## 📁 项目结构

```
miniprogram/
├── app.js                 # 全局配置（webviewUrl 在此修改）
├── app.json               # 页面路由配置
├── app.wxss               # 全局样式
├── project.config.json    # 项目配置（appid 在此修改）
├── sitemap.json           # 搜索配置
└── pages/
    ├── index/             # 欢迎页（原生小程序页面）
    │   ├── index.js
    │   ├── index.json
    │   ├── index.wxml
    │   └── index.wxss
    └── webview/           # WebView 页面（加载 React 应用）
        ├── webview.js
        ├── webview.json
        ├── webview.wxml
        └── webview.wxss
```
