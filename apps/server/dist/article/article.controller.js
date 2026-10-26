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
exports.ArticleController = void 0;
const common_1 = require("@nestjs/common");
const admin_check_1 = require("../auth/admin-check");
const admin_guard_1 = require("../auth/admin.guard");
const article_service_1 = require("./article.service");
const dto_1 = require("./dto");
let ArticleController = class ArticleController {
    articles;
    adminCheck;
    constructor(articles, adminCheck) {
        this.articles = articles;
        this.adminCheck = adminCheck;
    }
    list(query, req) {
        return this.articles.list(query, this.adminCheck.isAdmin(req.headers));
    }
    detail(slug, req) {
        return this.articles.getBySlug(slug, this.adminCheck.isAdmin(req.headers));
    }
    chapter(id, index, req) {
        return this.articles.getChapter(id, index, this.adminCheck.isAdmin(req.headers));
    }
    raw(id) {
        return this.articles.getRaw(id);
    }
    create(dto) {
        return this.articles.createFromMarkdown({
            contentMd: dto.contentMarkdown,
            title: dto.title,
            summary: dto.summary,
            tags: dto.tags,
            category: dto.category,
            cover: dto.cover,
            source: 'MANUAL',
        });
    }
    update(id, dto) {
        return this.articles.update(id, dto);
    }
    undo(id) {
        return this.articles.undo(id);
    }
    view(slug, req) {
        return this.articles.touchView(slug, req.ip);
    }
    /** 阅读时长上报（前端每约 60 秒上报一次增量；按 IP+文章限流） */
    readReport(id, dto, req) {
        return this.articles.reportRead(id, dto.seconds, req.ip);
    }
    remove(id) {
        return this.articles.remove(id);
    }
};
exports.ArticleController = ArticleController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ArticleController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':slug'),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ArticleController.prototype, "detail", null);
__decorate([
    (0, common_1.Get)(':id/chapters/:index'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('index', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, Object]),
    __metadata("design:returntype", Promise)
], ArticleController.prototype, "chapter", null);
__decorate([
    (0, common_1.Get)(':id/raw'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], ArticleController.prototype, "raw", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateArticleDto]),
    __metadata("design:returntype", void 0)
], ArticleController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, dto_1.UpdateArticleDto]),
    __metadata("design:returntype", Promise)
], ArticleController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/undo'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], ArticleController.prototype, "undo", null);
__decorate([
    (0, common_1.Post)(':slug/view'),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ArticleController.prototype, "view", null);
__decorate([
    (0, common_1.Post)(':id/read-report'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, dto_1.ReadReportDto, Object]),
    __metadata("design:returntype", Promise)
], ArticleController.prototype, "readReport", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], ArticleController.prototype, "remove", null);
exports.ArticleController = ArticleController = __decorate([
    (0, common_1.Controller)('articles'),
    __metadata("design:paramtypes", [article_service_1.ArticleService,
        admin_check_1.AdminCheckService])
], ArticleController);
//# sourceMappingURL=article.controller.js.map