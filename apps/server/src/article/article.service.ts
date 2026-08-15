import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { estimateReadingMinutes, parseFrontmatter, renderMarkdown, splitChapters } from '@myblog/markdown';
import type { ApiList, ArticleDetail, ArticleSummary, ChapterView, TocItem } from '@myblog/shared';
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '../config/config.service';
import { splitIntoChunks } from '../llm/chunker';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimiter } from '../auth/rate-limiter';

function parseQuestions(json: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(json ?? '[]') as unknown;
    return Array.isArray(parsed) ? (parsed as string[]).slice(0, 5) : [];
  } catch {
    return [];
  }
}

export interface CreateArticleInput {
  contentMd: string;
  title?: string;
  summary?: string;
  tags?: string[];
  category?: string;
  cover?: string;
  source?: string;
  fileId?: number;
  fallbackTitle?: string;
  private?: boolean;
}

export interface UpdateArticleInput {
  title?: string;
  summary?: string;
  tags?: string[];
  category?: string;
  cover?: string;
  status?: string;
  contentMarkdown?: string;
  private?: boolean;
}

export interface ListArticleQuery {
  tag?: string;
  q?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

interface ChapterRow {
  id: number;
  index: number;
  title: string;
  contentMd: string;
  wordCount: number;
}

@Injectable()
export class ArticleService {
  /** 章节渲染缓存：key = `ch:${chapterId}:${articleUpdatedAt}`，命中即免渲染（设计文档 10.1） */
  private readonly htmlCache = new Map<string, { html: string; toc: TocItem[] }>();

  /** 阅读计数限流：同一来源对同一文章每小时最多计 3 次（防刷榜） */
  private readonly viewLimiter = new RateLimiter(60 * 60 * 1000, 3);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ========== 列表 ==========
  async list(query: ListArticleQuery = {}, admin = false): Promise<ApiList<ArticleSummary>> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 12));

    // 可见性：status=all（含草稿）仅管理员可用；公开访问只能看已发布且非私密
    const wantAll = query.status === 'all';
    if (wantAll && !admin) throw new UnauthorizedException('需要管理口令');
    const where: Prisma.ArticleWhereInput = admin
      ? (wantAll ? {} : { status: query.status ?? 'PUBLISHED' })
      : { status: 'PUBLISHED', private: false };
    if (query.tag) where.tags = { some: { tag: { name: query.tag } } };
    if (query.q) where.OR = [{ title: { contains: query.q } }, { contentMarkdown: { contains: query.q } }];

    const orderBy: Prisma.ArticleOrderByWithRelationInput[] =
      query.sort === 'views' ? [{ stats: { viewCount: 'desc' } }] : [{ publishedAt: 'desc' }, { createdAt: 'desc' }];

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.article.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          tags: { select: { tag: true } },
          category: true,
          stats: true,
          _count: { select: { chapters: true } },
        },
      }),
      this.prisma.article.count({ where }),
    ]);

    return { items: rows.map((r) => this.toSummary(r)), total };
  }

  // ========== 详情 ==========
  async getBySlug(slug: string, admin = false): Promise<ArticleDetail> {
    const row = await this.prisma.article.findUnique({
      where: { slug },
      include: {
        tags: { select: { tag: true } },
        category: true,
        stats: true,
        chapters: { orderBy: { index: 'asc' }, select: { index: true, title: true, wordCount: true } },
        _count: { select: { chapters: true } },
      },
    });
    // 私密/草稿对非管理员一律 404（不泄露存在性）
    if (!row || ((row.status !== 'PUBLISHED' || row.private) && !admin)) {
      throw new NotFoundException('文章不存在或未发布');
    }

    const summary = this.toSummary(row);
    return {
      ...summary,
      chapters: row.chapters.map((c) => ({ index: c.index, title: c.title, wordCount: c.wordCount })),
      questions: parseQuestions(row.questionsJson),
    };
  }

  // ========== 章节渲染（带缓存）==========
  async getChapter(articleId: number, index?: number, admin = false): Promise<ChapterView> {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        slug: true,
        updatedAt: true,
        status: true,
        private: true,
        chapters: { orderBy: { index: 'asc' } },
      },
    });
    if (!article) throw new NotFoundException(`文章不存在: id=${articleId}`);
    // 私密/草稿章节对非管理员一律 404
    if ((article.status !== 'PUBLISHED' || article.private) && !admin) {
      throw new NotFoundException('文章不存在或未发布');
    }
    if (!article.chapters.length) throw new NotFoundException('该文章还没有章节');

    const chapter = index != null ? article.chapters.find((c) => c.index === index) : undefined;
    const current: ChapterRow = chapter ?? article.chapters[0];
    if (!current) throw new NotFoundException(`章节不存在: index=${index}`);

    const cacheKey = `ch:${current.id}:${article.updatedAt.getTime()}`;
    let cached = this.htmlCache.get(cacheKey);
    if (!cached) {
      cached = renderMarkdown(current.contentMd);
      if (this.htmlCache.size > 300) this.htmlCache.clear();
      this.htmlCache.set(cacheKey, cached);
    }

    const pos = article.chapters.findIndex((c) => c.id === current.id);
    return {
      articleId: article.id,
      articleSlug: article.slug,
      index: current.index,
      title: current.title,
      html: cached.html,
      toc: cached.toc,
      wordCount: current.wordCount,
      prevIndex: pos > 0 ? article.chapters[pos - 1].index : null,
      nextIndex: pos < article.chapters.length - 1 ? article.chapters[pos + 1].index : null,
      chapterCount: article.chapters.length,
    };
  }

  // ========== 创建（frontmatter → 分章 → 入库）==========
  async createFromMarkdown(input: CreateArticleInput) {
    const { data, content } = parseFrontmatter(input.contentMd);
    if (!content) throw new Error('内容为空，无法发布');

    const title = (input.title ?? data.title ?? input.fallbackTitle ?? '未命名文章').trim();
    const cleanTags = [...new Set((input.tags ?? data.tags ?? []).map((t) => String(t).trim()).filter(Boolean))].slice(0, 10);

    const chapters = splitChapters(content);
    const wordCount = chapters.reduce((sum, c) => sum + c.wordCount, 0);
    const slug = await this.makeSlug(title);

    const article = await this.prisma.article.create({
      data: {
        slug,
        title,
        summary: input.summary ?? data.summary ?? null,
        cover: input.cover ?? data.cover ?? null,
        contentMarkdown: content,
        wordCount,
        readingMinutes: estimateReadingMinutes(wordCount),
        status: data.draft === true ? 'DRAFT' : 'PUBLISHED',
        source: input.source ?? 'MANUAL',
        private: input.private === true || data.private === true, // 私密：AI 不可读
        fileId: input.fileId ?? null,
        publishedAt: new Date(),
        category: data.category
          ? { connectOrCreate: { where: { name: data.category }, create: { name: data.category } } }
          : undefined,
        tags: cleanTags.length
          ? { create: cleanTags.map((t) => ({ tag: { connectOrCreate: { where: { name: t }, create: { name: t } } } })) }
          : undefined,
        stats: { create: {} },
        chapters: {
          create: chapters.map((c) => ({
            index: c.index,
            title: c.title,
            contentMd: c.contentMd,
            wordCount: c.wordCount,
          })),
        },
      },
      include: {
        chapters: { orderBy: { index: 'asc' } },
        tags: { select: { tag: true } },
      },
    });
    await this.rebuildChunks(article.id, content);
    return article;
  }

  // ========== 原文（管理页编辑用，含 contentMarkdown）==========
  async getRaw(id: number) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      include: { tags: { select: { tag: true } }, category: true },
    });
    if (!article) throw new NotFoundException(`文章不存在: id=${id}`);
    return {
      id: article.id,
      slug: article.slug,
      title: article.title,
      summary: article.summary,
      category: article.category?.name ?? null,
      cover: article.cover,
      tags: article.tags.map((t) => t.tag.name),
      status: article.status,
      private: article.private,
      contentMarkdown: article.contentMarkdown,
    };
  }

  // ========== 更新（元数据 + 正文；正文变更时自动重新分章）==========
  async update(id: number, input: UpdateArticleInput): Promise<ArticleDetail> {
    const existing = await this.prisma.article.findUnique({
      where: { id },
      select: { id: true, contentMarkdown: true },
    });
    if (!existing) throw new NotFoundException(`文章不存在: id=${id}`);

    await this.saveRevision(id); // Ctrl+Z 快照

    const data: Prisma.ArticleUpdateInput = {};
    let contentChanged: string | null = null;

    if (input.title !== undefined) data.title = input.title.trim();
    if (input.summary !== undefined) data.summary = input.summary;
    if (input.cover !== undefined) data.cover = input.cover;
    if (input.status !== undefined) data.status = input.status;
    if (input.private !== undefined) data.private = input.private;

    if (input.category !== undefined) {
      data.category = input.category
        ? { connectOrCreate: { where: { name: input.category }, create: { name: input.category } } }
        : { disconnect: true };
    }

    if (input.tags !== undefined) {
      const cleanTags = [...new Set(input.tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 10);
      await this.prisma.articleTag.deleteMany({ where: { articleId: id } });
      data.tags = cleanTags.length
        ? { create: cleanTags.map((t) => ({ tag: { connectOrCreate: { where: { name: t }, create: { name: t } } } })) }
        : undefined;
    }

    if (input.contentMarkdown !== undefined) {
      const { content } = parseFrontmatter(input.contentMarkdown);
      if (!content) throw new Error('正文内容为空，无法保存');
      const chapters = splitChapters(content);
      const wordCount = chapters.reduce((sum, c) => sum + c.wordCount, 0);
      data.contentMarkdown = content;
      data.wordCount = wordCount;
      data.readingMinutes = estimateReadingMinutes(wordCount);
      // 章节重建；渲染缓存 key 含 article.updatedAt，update 后自动失效
      await this.prisma.chapter.deleteMany({ where: { articleId: id } });
      data.chapters = {
        create: chapters.map((c) => ({
          index: c.index,
          title: c.title,
          contentMd: c.contentMd,
          wordCount: c.wordCount,
        })),
      };
      contentChanged = content;
    }

    const article = await this.prisma.article.update({
      where: { id },
      data,
      include: {
        tags: { select: { tag: true } },
        category: true,
        stats: true,
        chapters: { orderBy: { index: 'asc' }, select: { index: true, title: true, wordCount: true } },
        _count: { select: { chapters: true } },
      },
    });

    if (contentChanged !== null || input.private !== undefined) {
      await this.rebuildChunks(id, contentChanged ?? existing.contentMarkdown);
    }

    const summary = this.toSummary(article);
    return {
      ...summary,
      chapters: article.chapters.map((c) => ({ index: c.index, title: c.title, wordCount: c.wordCount })),
      questions: parseQuestions(article.questionsJson),
    };
  }

  // ========== 删除（级联清理章节/标签/统计，并清理来源文件；快照供撤销重建）==========
  async remove(id: number): Promise<{ id: number; deleted: boolean }> {
    await this.saveRevision(id); // Ctrl+Z 快照（撤销后可重建）
    const article = await this.prisma.article.findUnique({ where: { id }, select: { fileId: true } });
    if (article?.fileId) {
      const file = await this.prisma.uploadFile.findUnique({ where: { id: article.fileId } });
      if (file) {
        await fsp.rm(join(this.config.uploadsDir, file.storedPath), { force: true }).catch(() => {});
        await this.prisma.uploadFile.delete({ where: { id: file.id } }).catch(() => {});
      }
    }
    await this.prisma.article.delete({ where: { id } }); // 章节/标签关联/统计级联删除
    return { id, deleted: true };
  }

  // ========== 撤销（Ctrl+Z：更新回滚 / 删除重建）==========
  async undo(id: number): Promise<ArticleDetail> {
    const revision = await this.prisma.articleRevision.findFirst({
      where: { articleId: id },
      orderBy: { createdAt: 'desc' },
    });
    if (!revision) throw new NotFoundException('没有可撤销的版本');

    const chapters = splitChapters(revision.contentMarkdown);
    const tags: string[] = JSON.parse(revision.tagsJson) as string[];
    const include = {
      tags: { select: { tag: true } },
      category: true,
      stats: true,
      chapters: { orderBy: { index: 'asc' as const }, select: { index: true, title: true, wordCount: true } },
      _count: { select: { chapters: true } },
    };
    const tagsData = tags.length
      ? { create: tags.map((t) => ({ tag: { connectOrCreate: { where: { name: t }, create: { name: t } } } })) }
      : undefined;
    const chaptersData = {
      create: chapters.map((c) => ({ index: c.index, title: c.title, contentMd: c.contentMd, wordCount: c.wordCount })),
    };

    const existing = await this.prisma.article.findUnique({ where: { id } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let article: any;
    if (existing) {
      await this.prisma.articleTag.deleteMany({ where: { articleId: id } });
      await this.prisma.chapter.deleteMany({ where: { articleId: id } });
      article = await this.prisma.article.update({
        where: { id },
        data: {
          // 注意：更新分支不动 slug（slug 创建时生成、终身稳定），避免唯一约束冲突
          title: revision.title,
          summary: revision.summary,
          cover: revision.cover,
          contentMarkdown: revision.contentMarkdown,
          wordCount: revision.wordCount,
          readingMinutes: revision.readingMinutes,
          status: revision.status,
          private: revision.private,
          category: revision.category
            ? { connectOrCreate: { where: { name: revision.category }, create: { name: revision.category } } }
            : { disconnect: true },
          tags: tagsData,
          chapters: chaptersData,
        },
        include,
      });
    } else {
      // 文章已被删除 → 用原 id 重建（slug 冲突时追加后缀）
      let slug = revision.slug;
      if (await this.prisma.article.findUnique({ where: { slug }, select: { id: true } })) {
        slug = `${slug}-${Date.now().toString(36)}`;
      }
      const createData: Prisma.ArticleUncheckedCreateInput = {
        id, // 保持原 id
        slug,
        title: revision.title,
        summary: revision.summary,
        cover: revision.cover,
        contentMarkdown: revision.contentMarkdown,
        wordCount: revision.wordCount,
        readingMinutes: revision.readingMinutes,
        status: revision.status,
        private: revision.private,
        source: 'MANUAL',
        fileId: null,
        publishedAt: new Date(),
        tags: tagsData,
        chapters: chaptersData,
        stats: { create: {} },
      };
      article = await this.prisma.article.create({ data: createData, include });
      if (revision.category) {
        // unchecked 输入只有 categoryId 标量，分类关系在创建后单独连接
        await this.prisma.article.update({
          where: { id },
          data: { category: { connectOrCreate: { where: { name: revision.category }, create: { name: revision.category } } } },
        });
      }
    }

    await this.prisma.articleRevision.delete({ where: { id: revision.id } });
    await this.rebuildChunks(id, revision.contentMarkdown);

    const summary = this.toSummary(article);
    if (revision.category) summary.category = revision.category; // 修正"创建后连接分类"的返回
    return {
      ...summary,
      chapters: article.chapters.map((c: { index: number; title: string; wordCount: number }) => ({
        index: c.index,
        title: c.title,
        wordCount: c.wordCount,
      })),
      questions: parseQuestions(article.questionsJson ?? '[]'),
    };
  }

  // ========== 版本快照（更新/删除前调用）==========
  private async saveRevision(articleId: number): Promise<void> {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      include: { tags: { select: { tag: true } }, category: true },
    });
    if (!article) return;

    await this.prisma.articleRevision.create({
      data: {
        articleId: article.id,
        slug: article.slug,
        title: article.title,
        summary: article.summary,
        category: article.category?.name ?? null,
        cover: article.cover,
        tagsJson: JSON.stringify(article.tags.map((t) => t.tag.name)),
        status: article.status,
        private: article.private,
        contentMarkdown: article.contentMarkdown,
        wordCount: article.wordCount,
        readingMinutes: article.readingMinutes,
      },
    });

    // 每篇文章最多保留 10 个版本
    const extras = await this.prisma.articleRevision.findMany({
      where: { articleId },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      select: { id: true },
    });
    if (extras.length) {
      await this.prisma.articleRevision.deleteMany({ where: { id: { in: extras.map((e) => e.id) } } });
    }
  }

  // ========== 阅读计数（限流：同 IP 同文章每小时最多 3 次） ==========
  async touchView(slug: string, ip?: string): Promise<void> {
    const article = await this.prisma.article.findUnique({ where: { slug }, select: { id: true } });
    if (!article) return; // 不存在则静默忽略（避免 500）
    const key = `view:${ip ?? 'unknown'}:${slug}`;
    if (!this.viewLimiter.allow(key)) return;
    await this.prisma.article.update({
      where: { slug },
      data: {
        stats: {
          upsert: { create: { viewCount: 1 }, update: { viewCount: { increment: 1 } } },
        },
      },
    });
  }

  // ========== 工具 ==========
  /** 重建知识检索分块（Phase 4：文章内容进入问答语料；私密文章不进入） */
  private async rebuildChunks(articleId: number, contentMarkdown: string): Promise<void> {
    await this.prisma.knowledgeChunk.deleteMany({ where: { articleId } });
    const article = await this.prisma.article.findUnique({ where: { id: articleId }, select: { private: true } });
    if (article?.private) return; // 私密：AI 无读取权
    const maxChars = this.config.getLlmRuntime().maxChars;
    const chunks = splitIntoChunks(contentMarkdown, maxChars);
    if (!chunks.length) return;
    await this.prisma.knowledgeChunk.createMany({
      data: chunks.map((content, i) => ({ articleId, chunkIndex: i, content })),
    });
  }

  private async makeSlug(title: string): Promise<string> {
    const base =
      title
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'article';
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
      const exists = await this.prisma.article.findUnique({ where: { slug }, select: { id: true } });
      if (!exists) return slug;
    }
    return `${base}-${Date.now().toString(36)}`;
  }

  private toSummary(row: {
    id: number;
    slug: string;
    title: string;
    summary: string | null;
    cover: string | null;
    wordCount: number;
    readingMinutes: number;
    status: string;
    private: boolean;
    tags: { tag: { name: string } }[];
    category?: { name: string } | null;
    stats?: { viewCount: number } | null;
    chapters?: { length: number };
    _count?: { chapters: number };
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): ArticleSummary {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      cover: row.cover,
      wordCount: row.wordCount,
      readingMinutes: row.readingMinutes,
      status: row.status as ArticleSummary['status'],
      private: row.private,
      tags: row.tags.map((t) => t.tag.name),
      category: row.category?.name ?? null,
      chapterCount: row._count?.chapters ?? row.chapters?.length ?? 0,
      viewCount: row.stats?.viewCount ?? 0,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
