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
exports.TagsController = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const admin_check_1 = require("../auth/admin-check");
const admin_guard_1 = require("../auth/admin.guard");
const prisma_service_1 = require("../prisma/prisma.service");
/** 颜色只允许十六进制色值（防注入任意 CSS） */
const COLOR_PATTERN = /^#[0-9a-fA-F]{3,8}$/;
/**
 * Prisma 错误 → 可读的 400（而不是 500）：
 * - P2002 唯一约束冲突：标签已被重名占用（含大小写/空白差异导致的隐性重名）
 * - P2025 记录不存在：标签在别处已被删掉（页面列表过期）
 * 其它错误原样抛出，交给全局异常处理。
 */
function asBadRequest(err, fallback) {
    const code = err?.code;
    if (code === 'P2002')
        throw new common_1.BadRequestException('标签名已存在（换个名字，或注意大小写/空格）');
    if (code === 'P2025')
        throw new common_1.BadRequestException('标签已不存在（可能刚被删除），请刷新标签列表');
    if (err instanceof common_1.BadRequestException)
        throw err;
    throw new common_1.BadRequestException(err instanceof Error ? `${fallback}：${err.message}` : fallback);
}
class CreateTagDto {
    name;
    color;
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(30),
    __metadata("design:type", String)
], CreateTagDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(20),
    (0, class_validator_1.Matches)(COLOR_PATTERN, { message: '颜色必须是 #RRGGBB 格式' }),
    __metadata("design:type", String)
], CreateTagDto.prototype, "color", void 0);
class UpdateTagDto {
    newName;
    color;
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(30),
    __metadata("design:type", String)
], UpdateTagDto.prototype, "newName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(20),
    (0, class_validator_1.Matches)(COLOR_PATTERN, { message: '颜色必须是 #RRGGBB 格式' }),
    __metadata("design:type", String)
], UpdateTagDto.prototype, "color", void 0);
let TagsController = class TagsController {
    prisma;
    adminCheck;
    constructor(prisma, adminCheck) {
        this.prisma = prisma;
        this.adminCheck = adminCheck;
    }
    /** 标签列表：公开口径只统计公开文章的标签（不泄露私密/草稿的标签存在性），管理员可见全量 */
    async list(req) {
        const admin = this.adminCheck.isAdmin(req.headers);
        const where = admin ? undefined : { article: { status: 'PUBLISHED', private: false } };
        const groups = await this.prisma.articleTag.groupBy({
            by: ['tagId'],
            where,
            _count: { _all: true },
        });
        const tags = await this.prisma.tag.findMany({ select: { id: true, name: true, color: true } });
        const counts = new Map(groups.map((g) => [g.tagId, g._count._all]));
        return tags
            .map((t) => ({ name: t.name, color: t.color, count: counts.get(t.id) ?? 0 }))
            .sort((a, b) => b.count - a.count);
    }
    /** 新增标签（管理） */
    async create(dto) {
        const name = dto.name.trim();
        if (!name)
            throw new common_1.BadRequestException('标签名不能为空');
        const exists = await this.prisma.tag.findUnique({ where: { name } });
        if (exists)
            throw new common_1.BadRequestException(`标签已存在: ${name}`);
        try {
            const tag = await this.prisma.tag.create({ data: { name, color: dto.color?.trim() || null } });
            return { name: tag.name, color: tag.color, count: 0 };
        }
        catch (err) {
            asBadRequest(err, '新增标签失败');
        }
    }
    /** 重命名 / 改颜色（管理；文章关联自动保留） */
    async update(name, dto) {
        const tag = await this.prisma.tag.findUnique({ where: { name } });
        if (!tag)
            throw new common_1.BadRequestException(`标签不存在: ${name}`);
        const newName = dto.newName?.trim();
        if (newName !== undefined && !newName)
            throw new common_1.BadRequestException('新标签名不能为空');
        if (newName && newName !== name) {
            const dup = await this.prisma.tag.findUnique({ where: { name: newName } });
            if (dup)
                throw new common_1.BadRequestException(`标签已存在: ${newName}`);
        }
        try {
            const updated = await this.prisma.tag.update({
                where: { id: tag.id },
                data: {
                    ...(newName ? { name: newName } : {}),
                    ...(typeof dto.color === 'string' ? { color: dto.color.trim() || null } : {}),
                },
            });
            const count = await this.prisma.articleTag.count({ where: { tagId: updated.id } });
            return { name: updated.name, color: updated.color, count };
        }
        catch (err) {
            asBadRequest(err, '保存标签失败');
        }
    }
    /** 删除标签（管理；同时移除与文章的关联） */
    async remove(name) {
        const tag = await this.prisma.tag.findUnique({ where: { name } });
        if (!tag)
            throw new common_1.BadRequestException(`标签不存在: ${name}`);
        try {
            await this.prisma.tag.delete({ where: { id: tag.id } }); // ArticleTag 关联级联删除
        }
        catch (err) {
            asBadRequest(err, '删除标签失败');
        }
        return { name, deleted: true };
    }
};
exports.TagsController = TagsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TagsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateTagDto]),
    __metadata("design:returntype", Promise)
], TagsController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':name'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Param)('name')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateTagDto]),
    __metadata("design:returntype", Promise)
], TagsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':name'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Param)('name')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TagsController.prototype, "remove", null);
exports.TagsController = TagsController = __decorate([
    (0, common_1.Controller)('tags'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        admin_check_1.AdminCheckService])
], TagsController);
//# sourceMappingURL=tags.controller.js.map