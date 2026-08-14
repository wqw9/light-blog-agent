import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** 本地日期 key（toISOString 是 UTC，会因时区偏移导致统计错天） */
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 统计总览卡片 */
  async overview() {
    const [articleTotal, publishedTotal, draftTotal, uploadTotal, tagTotal, wordsAgg, viewsAgg] =
      await this.prisma.$transaction([
        this.prisma.article.count(),
        this.prisma.article.count({ where: { status: 'PUBLISHED' } }),
        this.prisma.article.count({ where: { status: 'DRAFT' } }),
        this.prisma.uploadFile.count(),
        this.prisma.tag.count(),
        this.prisma.article.aggregate({
          where: { status: 'PUBLISHED' },
          _sum: { wordCount: true },
          _avg: { wordCount: true },
        }),
        this.prisma.articleStats.aggregate({
          _sum: { viewCount: true, totalReadSeconds: true },
        }),
      ]);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthNew = await this.prisma.article.count({ where: { createdAt: { gte: monthStart } } });

    return {
      articleTotal,
      publishedTotal,
      draftTotal,
      uploadTotal,
      tagTotal,
      wordTotal: wordsAgg._sum.wordCount ?? 0,
      avgWords: Math.round(wordsAgg._avg.wordCount ?? 0),
      viewTotal: viewsAgg._sum.viewCount ?? 0,
      readSecondsTotal: viewsAgg._sum.totalReadSeconds ?? 0,
      thisMonthNew,
    };
  }

  /** 近 365 天发布热力图（GitHub 风格，按本地日期） */
  async heatmap(): Promise<{ days: { date: string; count: number }[] }> {
    const rows = await this.prisma.article.findMany({
      where: { status: 'PUBLISHED' },
      select: { publishedAt: true, createdAt: true },
    });

    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end.getTime() - 364 * 24 * 3600 * 1000);

    const counts = new Map<string, number>();
    for (const r of rows) {
      const d = r.publishedAt ?? r.createdAt;
      if (d >= start && d <= end) counts.set(localDateKey(d), (counts.get(localDateKey(d)) ?? 0) + 1);
    }

    const days: { date: string; count: number }[] = [];
    for (let i = 0; i < 365; i++) {
      const d = new Date(start.getTime() + i * 24 * 3600 * 1000);
      const key = localDateKey(d);
      days.push({ date: key, count: counts.get(key) ?? 0 });
    }
    return { days };
  }

  /** 最近 12 个月发布趋势 */
  async monthly(): Promise<{ months: { month: string; count: number; words: number }[] }> {
    const rows = await this.prisma.article.findMany({
      where: { status: 'PUBLISHED' },
      select: { wordCount: true, publishedAt: true, createdAt: true },
    });

    const now = new Date();
    const buckets = new Map<string, { count: number; words: number }>();
    const months: { month: string; count: number; words: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = localMonthKey(d);
      buckets.set(key, { count: 0, words: 0 });
      months.push({ month: key, count: 0, words: 0 });
    }
    for (const r of rows) {
      const d = r.publishedAt ?? r.createdAt;
      const b = buckets.get(localMonthKey(d));
      if (b) {
        b.count += 1;
        b.words += r.wordCount;
      }
    }
    return { months: months.map((m) => ({ ...m, ...buckets.get(m.month) })) };
  }

  /** 阅读排行 */
  async top(limit = 10) {
    const take = Math.min(50, Math.max(1, Number(limit) || 10));
    const rows = await this.prisma.article.findMany({
      where: { status: 'PUBLISHED' },
      include: { stats: true },
      orderBy: { stats: { viewCount: 'desc' } },
      take,
    });
    return rows
      .filter((r) => (r.stats?.viewCount ?? 0) > 0)
      .map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        viewCount: r.stats?.viewCount ?? 0,
        wordCount: r.wordCount,
      }))
      .slice(0, Math.max(1, Number(limit) || 10));
  }
}
