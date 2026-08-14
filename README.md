# 拾页书阁 · MyBlog

> 像书一样的个人博客 —— 把每一篇 Markdown 装订成可以翻阅的章节。
> A book-like personal blog — every Markdown is bound into readable chapters.

设计文档 / Design doc: [`MyBlog框架设计文档.md`](./MyBlog框架设计文档.md)

---

## 1. 整体项目内容 / What This Project Is

一个"书页式"个人博客 + 个人知识库（前后端分离 monorepo）：

A book-style personal blog + personal knowledge base (frontend/backend monorepo):

| 模块 / Module | 说明 / Description |
|------|------|
| 书页阅读器 / Book Reader | 纸张质感、章节导航、目录抽屉、阅读进度、4 主题、字号调节、快捷键、沉浸模式 / Paper texture, chapter navigation, TOC drawer, progress, 4 themes, font sizes, shortcuts, immersive mode |
| Markdown 管线 / Pipeline | frontmatter 解析、自动分章（`---`/H1/软分章）、highlight.js 代码高亮、XSS 防护 / frontmatter, auto-chaptering, highlight.js, XSS-safe |
| 上传即发布 / Upload | 拖拽/粘贴/批量上传 md 自动出版；UTF-8/GBK 编码识别；文件名乱码修复 / drag & paste & batch upload; encoding auto-detect |
| 管理后台 / Admin | 文章编辑（自动重新分章）、草稿切换、删除、**Ctrl+Z 撤销**（版本快照）、标签管理、上传记录 / article editor, drafts, delete, Ctrl+Z undo (revision snapshots), tag manager, upload records |
| 动态小人 / Mascot | Live2D（oh-my-live2d，本地模型优先 + CDN 回退 + CSS 降级）、尺寸调节、点击打开问答、LLM 回答气泡 / Live2D with local model priority, resize, click-to-chat, reply bubble |
| 统计 / Stats | ECharts 仪表盘：发布热力图、月度趋势、标签分布、阅读排行 / dashboard: heatmap, monthly trend, tag pie, top reads |
| 自我介绍 / About | 全局气泡 + 快捷键 A + 介绍页；内容 Markdown 可编辑 / floating card, shortcut A, editable Markdown content |
| 安全 / Security | 口令自动 scrypt 哈希、登录限流（5次/10分钟→429）、CORS 白名单 / auto password hashing, rate limiting, CORS allowlist |
| 多供应商 / Multi-LLM | 每供应商独立 baseUrl/模型/视觉模型/价格/密钥（自动 AES-256-GCM 加密）、每日 Token 限额、花费统计与上限 / per-provider config, auto-encrypted keys, daily token & cost limits |
| 知识问答 / Q&A | SSE 流式 + 本地分块检索（RAG-lite）+ 引用溯源 + **会话历史** / streaming with local retrieval, citations, session history |
| AI 书籍整理 / Organize | 摘要/标签/分类/建议问题，上传后自动触发；图片转文章（视觉模型）、PDF/DOCX 转文章 / auto summary/tags/questions; image-to-md, doc-to-md |
| Skill 库 / Skills | 提示词即文件：自主增删改、一键 AI 生成（含"何时使用"）、对文章运行生成新文 / prompt-as-file library: CRUD, AI generator, run-on-article |
| 私密保护 / Privacy | 文章可标记 🔒 私密（AI 不可读、不进知识库）；所有提示词前置安全规则（防套话/防注入） / private articles excluded from AI; safety block prepended to every prompt |

## 2. AI 生成 / AI-Generated

本项目代码由 AI（DeepSeek 模型）辅助开发生成，并包含以下 AI 能力：
This project's code was developed with AI assistance (DeepSeek), and ships these AI features:

- 💬 知识问答（RAG）：基于书架文章回答并标注来源 / Q&A over your articles with citations
- 🤖 书籍整理：自动摘要/标签/分类/建议问题 / auto organize articles
- ✨ Skill 生成器：描述需求一键生成新 Skill（含"何时使用"小节）/ one-click skill generation
- 🖼 图片转文章（视觉模型）/ 📄 PDF/DOCX 转文章 / image & document to Markdown
- 模型回复显示在 Live2D 小人头顶气泡 / model replies shown above the mascot

使用 AI 功能前需在「管理 → LLM 设置」填入供应商 API Key（自动加密存储）。
Enable AI features under Manage → LLM Settings with your provider API key (auto-encrypted).

## 3. 技术栈 / Tech Stack

- 前端 / Frontend：Vue 3 · TypeScript · Vite · Pinia · Vue Router · ECharts · oh-my-live2d
- 后端 / Backend：NestJS · Prisma · SQLite
- Markdown：markdown-it · highlight.js · gray-matter（`@myblog/markdown` 包）
- 共享类型 / Shared：`@myblog/shared`

## 4. 快速开始 / Quick Start

前置 / Prerequisites：Node ≥ 18.18；pnpm（本环境可用 corepack 提供 / pnpm via corepack）

```powershell
# 下载并固定 pnpm / bootstrap pnpm
$env:COREPACK_HOME = "$(Get-Location)\.corepack"
corepack pnpm --version

# 安装依赖 / install
corepack pnpm install

# 构建共享包 → 生成 Prisma Client → 建库 → 种子文章 / setup DB & seed
corepack pnpm setup

# 并行启动后端(:3000) 与前端(:5173) / start dev servers
corepack pnpm dev
```

打开 / Open http://localhost:5173 —— 书架自带两篇示例文章，把 `.md` 拖进书架即可发布。
The shelf ships two sample articles; drag a `.md` onto it to publish.

## 5. 如何使用 / How to Use

| 功能 / Feature | 操作 / How |
|------|------|
| 发布文章 / Publish | 书架页拖入 md（自动分章）；或管理页手动编辑 / drop md on shelf |
| 阅读 / Read | 书页：`←/→` 翻章、`T` 目录、`F` 沉浸、A-/A+ 字号 / keyboard shortcuts |
| 编辑与撤销 / Edit & Undo | 书页顶部「编辑」；每次操作后 **Ctrl+Z** 可回滚/重建 / undo chip |
| 管理 / Manage | 导航「管理」：文章/上传记录/关于我/LLM 设置/Skill 库/标签 / Manage page |
| LLM 问答 / Q&A | 点小人或右下角 💬；📜 查看历史会话 / click mascot or 💬 button |
| AI 整理 / Organize | 管理页「🤖 整理」；上传 md 后自动触发 / auto after upload |
| Skill / Skills | Skill 库 ✨ 一键生成 → ▶ 运行在文章上生成新文 / generate & run |
| 小人 / Mascot | ⚖ 调大小、🙈/🐣 收起召唤；管理页可设置开关与气泡 / resize & toggle |
| 自我介绍 / About | 按 `A` 或右下角 👤；管理页「关于我」在线编辑 / shortcut A |
| 安全 / Security | 管理页写接口受口令保护（`config/admin.json`，明文自动转哈希）/ admin password |
| 用量 / Usage | LLM 设置页查看每日 Token/花费，可设限额与上限 / limits & costs |

## 6. 部署方法 / Deployment

### 6.1 生产构建 / Production Build

```powershell
corepack pnpm build
# 产物 / artifacts：
#   apps/server/dist          → Node 后端 / backend
#   apps/web/dist             → 静态前端 / static frontend
```

### 6.2 运行 / Run

```powershell
# 后端 / backend（默认端口 3000，可用环境变量 PORT 修改）
cd apps/server
node dist/main.js

# 前端静态文件由任意静态服务器托管，并反代 /api 与 /uploads 到后端
# Serve apps/web/dist with any static server, proxying /api & /uploads to :3000
```

### 6.3 Caddy 示例（自动 HTTPS）/ Caddy Example (auto HTTPS)

```
your-domain.com {
    root * /path/to/MyBlog/apps/web/dist
    try_files {path} /index.html          # SPA 路由 / SPA routing

    handle /api/* {
        reverse_proxy 127.0.0.1:3000
    }
    handle /uploads/* {
        reverse_proxy 127.0.0.1:3000
    }
}
```

### 6.4 部署前检查 / Pre-deploy Checklist

1. `config/site.json` 的 `allowedOrigins` 加入你的域名 / add your domain to CORS allowlist
2. 设置管理口令（明文自动转哈希）/ set admin password (auto-hashed)
3. 用环境变量 `PORT` 指定后端端口；建议用进程管理器（pm2/systemd）守护 / use a process manager
4. `data/`、`uploads/`、`config/` 需要持久化目录 / persistent volumes
5. ⚠️ 不要把含密钥的 config 提交到公开仓库（`data/secret.key` 已 gitignore）/ never commit configs containing keys

## 7. 配置说明 / Configuration（数据即配置 / config-as-data）

| 文件 / File | 内容 / Content |
|------|------|
| `config/site.json` | 站名、签名、导航、CORS 白名单 / site name, nav, CORS |
| `config/about.json` | 自我介绍（含 Markdown 扩展内容）/ about page data |
| `config/llm.json` | 多供应商、限额与价格；apiKey 明文会在启动时自动加密 / providers, limits; keys auto-encrypted on boot |
| `config/admin.json` | 管理口令（明文自动转 scrypt 哈希）/ admin password (auto-hashed) |
| `config/mascot.json` | 小人开关/模型/尺寸/气泡 / mascot options |
| `config/prompts/*.md` | Skill 提示词文件（管理页可编辑）/ skill prompt files |

## 8. 项目结构 / Structure

```
apps/
  web/       Vue 3 前端 / frontend
  server/    NestJS 后端 / backend
packages/
  shared/    共享类型与常量 / shared types & constants
  markdown/  Markdown 渲染管线 / render pipeline
config/      站点配置 / configuration
uploads/     上传文件与 Live2D 模型 / uploads & models
data/        SQLite 数据库 / database
scripts/     验证脚本 / verification scripts
```

## 9. API 速览 / API Overview

| 端点 / Endpoint | 说明 / Description |
|------|------|
| `GET /api/articles` | 文章列表（tag/q/page/sort；`status=all` 含草稿）/ list articles |
| `GET /api/articles/:slug` | 文章详情 / detail |
| `GET /api/articles/:id/chapters/:index` | 单章渲染 HTML（缓存）/ rendered chapter |
| `POST/PUT/DELETE /api/articles...` | 创建/更新/删除（需口令）；`POST /:id/undo` Ctrl+Z 撤销 / admin CRUD + undo |
| `POST /api/upload` | 上传（md 自动发布，需口令）/ upload |
| `GET /api/uploads` 等 | 上传记录管理（需口令）/ upload records |
| `GET /api/tags` + `POST/PUT/DELETE /api/tags...` | 标签读写（写需口令）/ tags |
| `GET /api/stats/*` | 统计（总览/热力图/月度/排行）/ stats |
| `POST /api/chat` | 知识问答（SSE 流式 + 引用）/ streaming Q&A |
| `GET /api/chat/sessions` 等 | 问答历史 / session history |
| `GET/PUT /api/llm/config`、`GET /api/llm/usage`、`POST /api/llm/test` | LLM 配置/用量/测试连接（写需口令）/ LLM config & usage |
| `POST /api/llm/organize/:id`、`image-to-md/:id`、`doc-to-md/:id` | AI 整理与转换（需口令）/ AI organize & convert |
| `GET/PUT /api/llm/prompts`、`/api/llm/skills*` | Skill 文件与库（写需口令）/ skills |
| `GET /api/site`、`/api/site/about`、`/api/site/mascot` | 站点/关于/小人配置 / site configs |

## 10. 验证 / Verification

`scripts/verify.ps1` 是一次性验证脚本（构建 → 建库 → 种子 → 上传/管理/撤销/限流/LLM/Skill 全链路冒烟 → 前端构建），结束后自动清理测试数据。在受限沙箱中运行需完整权限（Prisma 引擎与开发服务器依赖子进程管道通信）。

`scripts/verify.ps1` runs an end-to-end smoke test (build → db → seed → admin/undo/rate-limit/LLM/skills → frontend build) and cleans up after itself. It requires full permissions inside restricted sandboxes (Prisma engines & dev servers need child-process pipes).

---

*本项目由 AI 辅助开发 / This project was developed with AI assistance.*
