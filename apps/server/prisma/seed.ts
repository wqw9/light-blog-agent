/**
 * 种子数据：把 prisma/seed-articles/*.md 写入数据库（幂等：按 slug 先删后建）
 * 运行：pnpm --filter @myblog/server seed
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { estimateReadingMinutes, parseFrontmatter, splitChapters } from '@myblog/markdown';

const prisma = new PrismaClient();

function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'article'
  );
}

async function main(): Promise<void> {
  const dir = join(__dirname, 'seed-articles');
  const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();

  for (const file of files) {
    const source = readFileSync(join(dir, file), 'utf-8');
    const { data, content } = parseFrontmatter(source);
    const title = (data.title ?? file.replace(/\.md$/, '')).trim();
    const slug = slugifyTitle(title);

    const chapters = splitChapters(content);
    const wordCount = chapters.reduce((sum, c) => sum + c.wordCount, 0);

    // 幂等：先删除同 slug 文章（章节/标签关联/统计级联删除）
    await prisma.article.deleteMany({ where: { slug } });

    const article = await prisma.article.create({
      data: {
        slug,
        title,
        summary: data.summary ?? null,
        cover: data.cover ?? null,
        contentMarkdown: content,
        wordCount,
        readingMinutes: estimateReadingMinutes(wordCount),
        status: data.draft === true ? 'DRAFT' : 'PUBLISHED',
        source: 'MANUAL',
        publishedAt: data.date ? new Date(data.date) : new Date(),
        category: data.category
          ? { connectOrCreate: { where: { name: data.category }, create: { name: data.category } } }
          : undefined,
        tags: data.tags?.length
          ? { create: data.tags.map((t) => ({ tag: { connectOrCreate: { where: { name: t }, create: { name: t } } } })) }
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
      include: { chapters: true },
    });

    console.log(`[seed] 《${article.title}》 slug=${article.slug} 章节=${article.chapters.length} 字数=${wordCount}`);
  }

  const total = await prisma.article.count();
  console.log(`[seed] 完成，共 ${total} 篇文章`);
}

main()
  .catch((err) => {
    console.error('[seed] 失败:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
