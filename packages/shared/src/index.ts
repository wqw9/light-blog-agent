/**
 * @myblog/shared —— 前后端共享的类型与常量（纯类型 + 常量，无第三方运行时依赖）
 */

// ===== 状态常量 =====
// 说明：SQLite 不支持 enum，状态字段在 Prisma schema 中用 String 存储，
// 取值由以下常量约束，类型用 TS 联合类型。
export const ARTICLE_STATUS = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ArticleStatus = (typeof ARTICLE_STATUS)[keyof typeof ARTICLE_STATUS];

export const ARTICLE_SOURCE = { MANUAL: 'MANUAL', UPLOAD: 'UPLOAD' } as const;
export type ArticleSource = (typeof ARTICLE_SOURCE)[keyof typeof ARTICLE_SOURCE];

export const FILE_KIND = {
  MD: 'MD',
  TXT: 'TXT',
  PDF: 'PDF',
  DOCX: 'DOCX',
  IMAGE: 'IMAGE',
  UNKNOWN: 'UNKNOWN',
} as const;
export type FileKind = (typeof FILE_KIND)[keyof typeof FILE_KIND];

export const FILE_STATUS = {
  PENDING: 'PENDING',
  PARSED: 'PARSED',
  INDEXED: 'INDEXED',
  FAILED: 'FAILED',
} as const;
export type FileStatus = (typeof FILE_STATUS)[keyof typeof FILE_STATUS];

// ===== 上传规则（与设计文档 5.2 对齐）=====
export const ALLOWED_MD_EXT = ['.md', '.markdown', '.txt'] as const;
export const ALLOWED_DOC_EXT = ['.pdf', '.docx'] as const;
export const ALLOWED_IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif'] as const;

export const UPLOAD_LIMITS = {
  md: 20 * 1024 * 1024,
  doc: 50 * 1024 * 1024,
  image: 10 * 1024 * 1024,
} as const;

// ===== DTO / 视图模型 =====
export interface TocItem {
  id: string;
  text: string;
  level: number;
}

export interface ChapterMeta {
  index: number;
  title: string;
  wordCount: number;
}

export interface ArticleSummary {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  cover: string | null;
  wordCount: number;
  readingMinutes: number;
  status: ArticleStatus;
  /** 私密：AI 不可读 */
  private: boolean;
  tags: string[];
  category: string | null;
  chapterCount: number;
  viewCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ArticleDetail extends ArticleSummary {
  chapters: ChapterMeta[];
  /** AI 整理的"可以问这篇文章的问题" */
  questions?: string[];
}

export interface ChapterView {
  articleId: number;
  articleSlug: string;
  index: number;
  title: string;
  html: string;
  toc: TocItem[];
  wordCount: number;
  prevIndex: number | null;
  nextIndex: number | null;
  chapterCount: number;
}

export interface ApiList<T> {
  items: T[];
  total: number;
}

export interface UploadResultItem {
  filename: string;
  ok: boolean;
  fileId?: number;
  kind?: FileKind;
  url?: string;
  article?: { id: number; slug: string; title: string; chapterCount: number };
  duplicate?: boolean;
  warning?: string;
  error?: string;
}

export interface SiteConfig {
  name: string;
  signature: string;
  description: string;
  nav: { label: string; path: string }[];
  /** 允许跨域的前端来源（CORS 白名单）；缺省时放开（开发模式） */
  allowedOrigins?: string[];
}
