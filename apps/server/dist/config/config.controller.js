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
exports.ConfigController = void 0;
const common_1 = require("@nestjs/common");
const markdown_1 = require("@myblog/markdown");
const admin_guard_1 = require("../auth/admin.guard");
const config_service_1 = require("./config.service");
const dto_1 = require("./dto");
let ConfigController = class ConfigController {
    config;
    constructor(config) {
        this.config = config;
    }
    site() {
        return this.config.site;
    }
    /** 站点设置（当前支持背景图）：管理页保存后立即生效 */
    async updateSite(dto) {
        try {
            await this.config.saveSite(dto ?? {});
        }
        catch (err) {
            throw new common_1.BadRequestException(err instanceof Error ? err.message : '站点配置无效');
        }
        return this.config.site;
    }
    /**
     * 自我介绍数据 + 渲染后的 Markdown 正文（contentHtml）。
     * config/about.json 的 content 字段是自由扩展区，介绍页直接展示。
     * 实时读文件：改文件或管理页保存后立即生效。
     */
    about() {
        const data = this.config.getAboutData();
        const content = typeof data.content === 'string' ? data.content : '';
        return { ...data, content, contentHtml: (0, markdown_1.renderMarkdown)(content).html };
    }
    /** 管理页编辑器读取原文（含 Markdown content） */
    aboutRaw() {
        return this.config.getAboutData();
    }
    /** 保存自我介绍（写回 config/about.json，数据即配置） */
    async updateAbout(dto) {
        await this.config.saveAbout(dto);
        const content = dto.content ?? '';
        return { ...dto, contentHtml: (0, markdown_1.renderMarkdown)(content).html };
    }
    /**
     * 友链数据（config/friends.json，公开读取）。
     * 与自我介绍一样实时读文件：改文件或管理页保存后立即生效。
     */
    friends() {
        return this.config.getFriendsData();
    }
    /** 保存友链（管理页「友链」标签）：写回 config/friends.json，链接协议白名单校验 */
    async updateFriends(dto) {
        try {
            return await this.config.saveFriends(dto);
        }
        catch (err) {
            throw new common_1.BadRequestException(err instanceof Error ? err.message : '友链配置无效');
        }
    }
    /** 动态小人配置（Phase 3）：实时读文件，改配置刷新页面即生效 */
    mascot() {
        return this.config.getMascotData();
    }
    /** 小人设置开关（管理页）：启用/LLM 回答气泡/隐藏自带蓝色气泡 */
    async updateMascot(dto) {
        await this.config.saveMascotConfig(dto);
        return this.config.getMascotData();
    }
};
exports.ConfigController = ConfigController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], ConfigController.prototype, "site", null);
__decorate([
    (0, common_1.Put)(),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ConfigController.prototype, "updateSite", null);
__decorate([
    (0, common_1.Get)('about'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], ConfigController.prototype, "about", null);
__decorate([
    (0, common_1.Get)('about/raw'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], ConfigController.prototype, "aboutRaw", null);
__decorate([
    (0, common_1.Put)('about'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.UpdateAboutDto]),
    __metadata("design:returntype", Promise)
], ConfigController.prototype, "updateAbout", null);
__decorate([
    (0, common_1.Get)('friends'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], ConfigController.prototype, "friends", null);
__decorate([
    (0, common_1.Put)('friends'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.UpdateFriendsDto]),
    __metadata("design:returntype", Promise)
], ConfigController.prototype, "updateFriends", null);
__decorate([
    (0, common_1.Get)('mascot'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], ConfigController.prototype, "mascot", null);
__decorate([
    (0, common_1.Put)('mascot'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ConfigController.prototype, "updateMascot", null);
exports.ConfigController = ConfigController = __decorate([
    (0, common_1.Controller)('site'),
    __metadata("design:paramtypes", [config_service_1.ConfigService])
], ConfigController);
//# sourceMappingURL=config.controller.js.map