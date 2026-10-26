"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
/** 本地日期 key（toISOString 是 UTC，会因时区偏移导致统计错天） */
function localDateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function localMonthKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
let StatsService = class StatsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    /** 统计总览卡片：管理员可见草稿数等内部数据，公开访问只返回公开口径 */
    async overview(admin = false) {
        const [articleTotal, publishedTotal, draftTotal, uploadTotal, tagTotal, wordsAgg, viewsAgg] = await this.prisma.$transaction([
            this.prisma.article.count(admin ? undefined : { where: { status: 'PUBLISHED', private: false } }),
            this.prisma.article.count({ where: admin ? { status: 'PUBLISHED' } : { status: 'PUBLISHED', private: false } }),
            this.prisma.article.count({ where: { status: 'DRAFT' } }),
            this.prisma.uploadFile.count(),
            this.prisma.tag.count(),
            this.prisma.article.aggregate({
                where: { status: 'PUBLISHED', private: false },
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
            draftTotal: admin ? draftTotal : 0,
            uploadTotal: admin ? uploadTotal : 0,
            tagTotal: admin ? tagTotal : 0,
            wordTotal: wordsAgg._sum.wordCount ?? 0,
            avgWords: Math.round(wordsAgg._avg.wordCount ?? 0),
            viewTotal: viewsAgg._sum.viewCount ?? 0,
            readSecondsTotal: viewsAgg._sum.totalReadSeconds ?? 0,
            thisMonthNew: admin ? thisMonthNew : 0,
        };
    }
    /** 近 365 天发布热力图（GitHub 风格，按本地日期；只统计公开文章） */
    async heatmap() {
        const rows = await this.prisma.article.findMany({
            where: { status: 'PUBLISHED', private: false },
            select: { publishedAt: true, createdAt: true },
        });
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        const start = new Date(end.getTime() - 364 * 24 * 3600 * 1000);
        const counts = new Map();
        for (const r of rows) {
            const d = r.publishedAt ?? r.createdAt;
            if (d >= start && d <= end)
                counts.set(localDateKey(d), (counts.get(localDateKey(d)) ?? 0) + 1);
        }
        const days = [];
        for (let i = 0; i < 365; i++) {
            const d = new Date(start.getTime() + i * 24 * 3600 * 1000);
            const key = localDateKey(d);
            days.push({ date: key, count: counts.get(key) ?? 0 });
        }
        return { days };
    }
    /** 最近 12 个月发布趋势（只统计公开文章） */
    async monthly() {
        const rows = await this.prisma.article.findMany({
            where: { status: 'PUBLISHED', private: false },
            select: { wordCount: true, publishedAt: true, createdAt: true },
        });
        const now = new Date();
        const buckets = new Map();
        const months = [];
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
    /** 阅读排行：公开口径排除私密文章，管理员可见全部 */
    async top(limit = 10, admin = false) {
        const take = Math.min(50, Math.max(1, Number(limit) || 10));
        const rows = await this.prisma.article.findMany({
            where: admin ? { status: 'PUBLISHED' } : { status: 'PUBLISHED', private: false },
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
};
exports.StatsService = StatsService;
exports.StatsService = StatsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], StatsService);
//# sourceMappingURL=stats.service.js.map