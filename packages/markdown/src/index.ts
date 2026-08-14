/**
 * @myblog/markdown —— Markdown 渲染管线
 *
 * 能力（对应设计文档 5.1 / 5.7.1）：
 *  - frontmatter 解析（gray-matter）
 *  - 代码高亮（highlight.js，190+ 语言）
 *  - 标题锚点 + 目录收集（h1~h3）
 *  - 自动分章：显式 `---` 分章符 → H1 标题 → 超长软分章
 *  - 字数统计（中日韩字符 + 拉丁单词）
 *
 * 安全：html:false（不渲染原始 HTML）+ 链接协议白名单，防 XSS。
 */
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

// ---------- 类型 ----------
export interface FrontmatterData {
  title?: string;
  summary?: string;
  tags?: string[];
  cover?: string;
  category?: string;
  date?: string;
  draft?: boolean;
  /** 私密：AI 不可读 */
  private?: boolean;
  /** Skill 文件等自定义元数据 */
  description?: string;
}

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

export interface Chapter {
  index: number;
  title: string;
  contentMd: string;
  wordCount: number;
}

export interface RenderedMarkdown {
  html: string;
  toc: TocItem[];
}

// ---------- 锚点 id 生成 ----------
function slugify(text: string): string {
  const s = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fff-]/g, '');
  return s || 'section';
}

// 只允许安全协议，阻断 javascript: 等危险链接
const SAFE_LINK = /^(https?:|mailto:|#|\/|\.)/i;

// ---------- markdown-it 实例 ----------
const md: MarkdownIt = new MarkdownIt({
  html: false, // 不渲染原始 HTML，防 XSS
  linkify: true,
  breaks: false,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        const { value } = hljs.highlight(str, { language: lang, ignoreIllegals: true });
        return `<pre class="hljs"><code>${value}</code></pre>`;
      } catch {
        // 高亮失败则按纯文本输出
      }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
  },
});

// markdown-it 14 起 validateLink 不再作为构造选项，挂到实例上
md.validateLink = (url: string) => SAFE_LINK.test(url.trim());

// 核心规则：给标题 token 加锚点 id，并把 h1~h3 收集为目录（写入 state.env.toc）
md.core.ruler.push('heading_anchor_toc', (state) => {
  const toc: TocItem[] = [];
  for (let i = 0; i < state.tokens.length; i++) {
    const token = state.tokens[i];
    if (token.type === 'heading_open') {
      const level = Number(token.tag.slice(1));
      const inline = state.tokens[i + 1];
      const text = inline && inline.type === 'inline' ? inline.content : '';
      const id = slugify(text);
      token.attrSet('id', id);
      if (level <= 3) toc.push({ id, text, level });
    }
  }
  state.env.toc = toc;
  return false;
});

// ---------- frontmatter ----------
export function parseFrontmatter(source: string): { data: FrontmatterData; content: string } {
  const parsed = matter(source);
  const data = (parsed.data ?? {}) as FrontmatterData;
  // 兼容 `tags: 随笔`（单值）与 `tags: [a, b]`
  if (data.tags != null && !Array.isArray(data.tags)) data.tags = [String(data.tags)];
  return { data, content: parsed.content.trim() };
}

// ---------- 渲染 ----------
export function renderMarkdown(sourceMd: string): RenderedMarkdown {
  const env: { toc: TocItem[] } = { toc: [] };
  const html = md.render(sourceMd, env);
  return { html, toc: env.toc };
}

// ---------- 字数统计 ----------
export function countWords(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) ?? []).length;
  const latin = (text.match(/[a-zA-Z0-9_]+/g) ?? []).length;
  return cjk + latin;
}

export function estimateReadingMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 400));
}

// ---------- 自动分章 ----------
/**
 * 分章规则（设计文档 5.7.1）：
 *  1. 显式分章符：单独一行的 3 个及以上 "-" 或 "*"
 *  2. 否则按一级标题（#）切分
 *  3. 章节超过 softMaxWords 时软分章
 */
export function splitChapters(contentMd: string, softMaxWords = 2500): Chapter[] {
  const trimmed = contentMd.trim();
  if (!trimmed) return [];

  let sections = trimmed
    .split(/^\s*(?:---+|\*\*\*+)\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sections.length < 2) {
    const headings = [...trimmed.matchAll(/^#\s+(.+)$/gm)];
    if (headings.length >= 2) {
      const parts: string[] = [];
      if (headings[0].index! > 0) parts.push(trimmed.slice(0, headings[0].index).trim());
      headings.forEach((m, i) => {
        const start = m.index!;
        const end = i + 1 < headings.length ? headings[i + 1].index! : trimmed.length;
        parts.push(trimmed.slice(start, end).trim());
      });
      sections = parts.filter(Boolean);
    } else {
      sections = [trimmed];
    }
  }

  const chapters: Chapter[] = [];
  let index = 1;
  for (const section of sections) {
    for (const piece of softSplit(section, softMaxWords)) {
      const heading = piece.match(/^#\s+(.+)$/m);
      const title = heading ? heading[1].trim() : `第 ${index} 章`;
      chapters.push({ index: index++, title, contentMd: piece, wordCount: countWords(piece) });
    }
  }
  return chapters;
}

function softSplit(text: string, maxWords: number): string[] {
  if (countWords(text) <= maxWords) return [text];
  const paragraphs = text.split(/\n{2,}/);
  const out: string[] = [];
  let current = '';
  for (const p of paragraphs) {
    const merged = current ? `${current}\n\n${p}` : p;
    if (current && countWords(merged) > maxWords) {
      out.push(current);
      current = p;
    } else {
      current = merged;
    }
  }
  if (current) out.push(current);
  return out;
}
