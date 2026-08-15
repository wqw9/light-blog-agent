# 拾页书阁 · MyBlog

> A book-like personal blog — every Markdown is bound into readable chapters.

[中文](./README.zh-CN.md) · Design doc: [`MyBlog框架设计文档.md`](./MyBlog框架设计文档.md)

---

## 1. What This Project Is

A book-style personal blog + personal knowledge base (frontend/backend monorepo):

| Module | Description |
|------|------|
| Book Reader | Paper texture, chapter navigation, TOC drawer, reading progress, 4 themes, font sizes, keyboard shortcuts, immersive mode |
| Markdown Pipeline | Frontmatter parsing, auto-chaptering (`---`/H1/soft), highlight.js code highlighting, XSS-safe |
| Upload & Publish | Drag & paste & batch upload of md auto-publishes; UTF-8/GBK encoding auto-detect; filename mojibake fix |
| Admin | Article editor (auto re-chaptering), draft toggle, delete, **Ctrl+Z undo** (revision snapshots), tag manager, upload records |
| Mascot | Live2D (oh-my-live2d, local model priority + CDN fallback + CSS fallback), resize, click-to-chat, LLM reply bubble |
| Stats | ECharts dashboard: publish heatmap, monthly trend, tag distribution, top reads |
| About | Floating card + shortcut A + about page; editable Markdown content |
| Security | Auto scrypt password hashing, login rate limiting (5 per 10 min → 429), admin APIs refuse everything when no password is set (fail-closed), private/draft visible to admin only, authenticated downloads for raw uploads, CORS allowlist, security headers |
| Multi-LLM | Per-provider baseUrl/model/vision model/pricing/key (auto AES-256-GCM encrypted, baseUrl safety-checked), daily token limit, cost tracking & cap |
| Q&A | SSE streaming + local chunk retrieval (RAG-lite) + citations + **session history** |
| AI Organize | Summary/tags/category/suggested questions, auto after upload; image-to-article (vision model), PDF/DOCX-to-article |
| Skills | Prompt-as-file library: CRUD, one-click AI generation (with a "when to use" section), run-on-article to create new drafts |
| Privacy | Articles can be marked 🔒 private (hidden from readers, excluded from AI & knowledge base); drafts are admin-only too; safety rules prepended to every prompt |

## 2. AI-Generated

This project's code was developed with AI assistance (DeepSeek), and ships these AI features:

- 💬 Knowledge Q&A (RAG): answers grounded in your shelf articles with citations
- 🤖 Book Organizer: auto summary/tags/category/suggested questions
- ✨ Skill Generator: describe a need and generate a new Skill in one click (with a "when to use" section)
- 🖼 Image-to-Article (vision model) / 📄 PDF/DOCX-to-Article
- Model replies shown in a bubble above the Live2D mascot

Enable AI features under Manage → LLM Settings with your provider API key (auto-encrypted).

## 3. Tech Stack

- Frontend: Vue 3 · TypeScript · Vite · Pinia · Vue Router · ECharts · oh-my-live2d
- Backend: NestJS · Prisma · SQLite
- Markdown: markdown-it · highlight.js · gray-matter (`@myblog/markdown` package)
- Shared types: `@myblog/shared`

## 4. Quick Start

Prerequisites: Node ≥ 18.18; pnpm (corepack works in this environment)

```powershell
# Bootstrap a pinned pnpm
$env:COREPACK_HOME = "$(Get-Location)\.corepack"
corepack pnpm --version

# Install dependencies
corepack pnpm install

# Build shared packages → generate Prisma Client → create DB → seed articles
corepack pnpm setup

# Start backend (:3000) and frontend (:5173) in parallel
corepack pnpm dev
```

Open http://localhost:5173 — the shelf ships two sample articles; drag a `.md` onto it to publish.

## 5. How to Use

| Feature | How |
|------|------|
| Publish | Drop a markdown file on the shelf (auto-chaptered), or edit manually in Manage |
| Read | Book pages: `←/→` chapters, `T` TOC, `F` immersive, A-/A+ font size |
| Edit & Undo | "Edit" at the top of the reader; **Ctrl+Z** after any change to roll back/rebuild |
| Manage | Nav "管理": articles, upload records, about, LLM settings, skill library, tags |
| LLM Q&A | Click the mascot or the 💬 button; 📜 to view session history |
| AI Organize | "🤖 Organize" in Manage; runs automatically after md upload |
| Skills | Skill library: ✨ generate in one click → ▶ run on an article to create a new draft |
| Mascot | ⚖ resize, 🙈 hide / 🐣 summon; toggles & bubble in Manage |
| About | Press `A` or 👤 at the bottom-right; edit online in Manage |
| Security | Admin write APIs protected by password (`config/admin.json`, plaintext auto-hashed); **all admin APIs are refused until a password is set** |
| Usage | LLM settings page shows daily tokens/cost with configurable limits |

## 6. Deployment

### 6.1 Production Build

```powershell
corepack pnpm build
# artifacts:
#   apps/server/dist          → Node backend
#   apps/web/dist             → static frontend
```

### 6.2 Run

```powershell
# Backend (default port 3000, override with the PORT env var)
cd apps/server
node dist/main.js

# Serve apps/web/dist with any static server, proxying /api & /uploads to :3000
```

### 6.3 Caddy Example (auto HTTPS)

```
your-domain.com {
    root * /path/to/MyBlog/apps/web/dist
    try_files {path} /index.html          # SPA routing

    handle /api/* {
        reverse_proxy 127.0.0.1:3000
    }
    handle /uploads/* {
        reverse_proxy 127.0.0.1:3000
    }
}
```

### 6.4 Pre-deploy Checklist

1. Add your domain to `allowedOrigins` in `config/site.json`
2. ⚠️ **Set an admin password first** (`password` in `config/admin.json` or the `MYBLOG_ADMIN_PASSWORD` env var; plaintext auto-hashed; admin APIs refuse everything until set)
3. Set the backend port with the `PORT` env var; use a process manager (pm2/systemd)
4. Persist `data/`, `uploads/`, `config/` directories
5. ⚠️ Never commit configs containing keys (`data/secret.key` is gitignored)

## 7. Configuration (config-as-data)

| File | Content |
|------|------|
| `config/site.json` | Site name, signature, nav, CORS allowlist |
| `config/about.json` | About page data (with Markdown extensions) |
| `config/llm.json` | Providers, limits & pricing; plaintext apiKeys auto-encrypted on boot |
| `config/admin.json` | Admin password (plaintext auto-hashed with scrypt) |
| `config/mascot.json` | Mascot toggles/model/size/bubble |
| `config/prompts/*.md` | Skill prompt files (editable in Manage) |

## 8. Structure

```
apps/
  web/       Vue 3 frontend
  server/    NestJS backend
packages/
  shared/    shared types & constants
  markdown/  Markdown render pipeline
config/      site configuration
uploads/     uploads & Live2D models
data/        SQLite database
scripts/     verification scripts
```

## 9. API Overview

| Endpoint | Description |
|------|------|
| `GET /api/articles` | List articles (tag/q/page/sort; `status=all` includes drafts) |
| `GET /api/articles/:slug` | Article detail |
| `GET /api/articles/:id/chapters/:index` | Rendered chapter HTML (cached) |
| `POST/PUT/DELETE /api/articles...` | Create/update/delete (password required); `POST /:id/undo` Ctrl+Z undo |
| `POST /api/upload` | Upload (md auto-published, password required) |
| `GET /api/uploads` etc. | Upload records management (password required) |
| `GET /api/tags` + `POST/PUT/DELETE /api/tags...` | Tags (writes need password) |
| `GET /api/stats/*` | Stats (overview/heatmap/monthly/ranking) |
| `POST /api/chat` | Knowledge Q&A (SSE streaming + citations) |
| `GET /api/chat/sessions` etc. | Session history |
| `GET/PUT /api/llm/config`, `GET /api/llm/usage`, `POST /api/llm/test` | LLM config/usage/test connection (writes need password) |
| `POST /api/llm/organize/:id`, `image-to-md/:id`, `doc-to-md/:id` | AI organize & convert (password required) |
| `GET/PUT /api/llm/prompts`, `/api/llm/skills*` | Skill files & library (writes need password) |
| `GET /api/site`, `/api/site/about`, `/api/site/mascot` | Site/about/mascot configs |

## 10. Verification

`scripts/verify.ps1` runs an end-to-end smoke test (build → db → seed → admin/undo/rate-limit/LLM/skills → frontend build) and cleans up after itself. It requires full permissions inside restricted sandboxes (Prisma engines & dev servers need child-process pipes).

This project has gone through a full red-team penetration test and hardening pass — see [`update/修复记录/2026-08-15-红队渗透与安全加固.md`](./update/修复记录/2026-08-15-红队渗透与安全加固.md) (in Chinese).

---

*This project was developed with AI assistance.*
