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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnnotationsController = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const class_validator_1 = require("class-validator");
const admin_guard_1 = require("../auth/admin.guard");
const rate_limiter_1 = require("../auth/rate-limiter");
const prisma_service_1 = require("../prisma/prisma.service");
class CreateAnnotationDto {
    quoteText;
    note;
    author;
    chapterIndex;
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(300),
    __metadata("design:type", String)
], CreateAnnotationDto.prototype, "quoteText", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], CreateAnnotationDto.prototype, "note", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(30),
    __metadata("design:type", String)
], CreateAnnotationDto.prototype, "author", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateAnnotationDto.prototype, "chapterIndex", void 0);
/**
 * 句子书注（公开协作）：
 * - 任何访客都可以对已发布且非私密的文章写书注（选中句子 → 注释）
 * - 同 IP 每小时最多 10 条（防刷），IP 只存 SHA-256 哈希（不存原始 IP）
 * - 删除仅管理员可用
 */
let AnnotationsController = class AnnotationsController {
    prisma;
    limiter = new rate_limiter_1.RateLimiter(60 * 60 * 1000, 10);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async list(id) {
        const rows = await this.prisma.annotation.findMany({
            where: { articleId: id },
            orderBy: { createdAt: 'asc' },
        });
        return rows.map((a) => ({
            id: a.id,
            chapterIndex: a.chapterIndex,
            quoteText: a.quoteText,
            note: a.note,
            author: a.author,
            createdAt: a.createdAt.toISOString(),
        }));
    }
    async create(id, dto, req) {
        const article = await this.prisma.article.findUnique({
            where: { id },
            select: { status: true, private: true },
        });
        if (!article || article.status !== 'PUBLISHED' || article.private) {
            throw new common_1.BadRequestException('文章不存在或未发布');
        }
        const ip = req.ip ?? 'unknown';
        const ipHash = (0, node_crypto_1.createHash)('sha256').update(ip).digest('hex');
        if (!this.limiter.allow(`anno:${ipHash}`)) {
            throw new common_1.BadRequestException('书注提交过于频繁，请稍后再试');
        }
        const quoteText = dto.quoteText.trim();
        const note = dto.note.trim();
        if (!quoteText || !note)
            throw new common_1.BadRequestException('引文与书注不能为空');
        const annotation = await this.prisma.annotation.create({
            data: {
                articleId: id,
                chapterIndex: Math.max(1, Number(dto.chapterIndex) || 1),
                quoteText,
                note,
                author: dto.author?.trim() || null,
                ipHash,
            },
        });
        return {
            id: annotation.id,
            chapterIndex: annotation.chapterIndex,
            quoteText: annotation.quoteText,
            note: annotation.note,
            author: annotation.author,
            createdAt: annotation.createdAt.toISOString(),
        };
    }
    async remove(id) {
        const existing = await this.prisma.annotation.findUnique({ where: { id }, select: { id: true } });
        if (!existing)
            throw new common_1.BadRequestException('书注不存在');
        await this.prisma.annotation.delete({ where: { id } });
        return { id, deleted: true };
    }
};
exports.AnnotationsController = AnnotationsController;
__decorate([
    (0, common_1.Get)('articles/:id/annotations'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AnnotationsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('articles/:id/annotations'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, CreateAnnotationDto, Object]),
    __metadata("design:returntype", Promise)
], AnnotationsController.prototype, "create", null);
__decorate([
    (0, common_1.Delete)('annotations/:id'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AnnotationsController.prototype, "remove", null);
exports.AnnotationsController = AnnotationsController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AnnotationsController);
//# sourceMappingURL=annotations.controller.js.map