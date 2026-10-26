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
exports.LlmController = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const admin_guard_1 = require("../auth/admin.guard");
const rate_limiter_1 = require("../auth/rate-limiter");
const config_service_1 = require("../config/config.service");
const llm_service_1 = require("./llm.service");
class ChatMessageDto {
    role;
    content;
}
__decorate([
    (0, class_validator_1.IsIn)(['user', 'assistant']),
    __metadata("design:type", String)
], ChatMessageDto.prototype, "role", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(8000),
    __metadata("design:type", String)
], ChatMessageDto.prototype, "content", void 0);
class ChatDto {
    messages;
    sessionId;
    /** 可选：指定 Skill 名称（如 book-finder 书籍搜索），使用该 Skill 的提示词回答 */
    skill;
}
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(30),
    __metadata("design:type", Array)
], ChatDto.prototype, "messages", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], ChatDto.prototype, "sessionId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(60),
    __metadata("design:type", String)
], ChatDto.prototype, "skill", void 0);
class UpdateLlmConfigDto {
    enabled;
    activeProvider;
    dailyTokenLimit;
    costLimitUsd;
    providers;
}
__decorate([
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateLlmConfigDto.prototype, "enabled", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateLlmConfigDto.prototype, "activeProvider", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UpdateLlmConfigDto.prototype, "dailyTokenLimit", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UpdateLlmConfigDto.prototype, "costLimitUsd", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], UpdateLlmConfigDto.prototype, "providers", void 0);
let LlmController = class LlmController {
    llm;
    config;
    /** 对话限流：同一来源每分钟最多 20 次（防 token 预算滥用；LLM 未启用时不消耗额度） */
    chatLimiter = new rate_limiter_1.RateLimiter(60 * 1000, 20);
    constructor(llm, config) {
        this.llm = llm;
        this.config = config;
    }
    status() {
        return this.llm.status();
    }
    /** 管理页：读取 LLM 配置（密钥脱敏） */
    llmConfig() {
        return this.config.getLlmView();
    }
    /** 管理页：保存 LLM 配置（多供应商；apiKey 非空时立即加密存储；baseUrl 做安全校验） */
    async saveConfig(dto) {
        try {
            await this.config.saveLlmConfig({
                enabled: dto.enabled,
                activeProvider: dto.activeProvider,
                dailyTokenLimit: dto.dailyTokenLimit,
                costLimitUsd: dto.costLimitUsd,
                providers: dto.providers,
            });
        }
        catch (err) {
            throw new common_1.BadRequestException(err instanceof Error ? err.message : 'LLM 配置无效');
        }
        return this.config.getLlmView();
    }
    /** 测试连接：用当前配置发一条最小请求 */
    async testConnection() {
        try {
            return { ok: true, ...(await this.llm.testConnection()) };
        }
        catch (err) {
            throw new common_1.BadRequestException(err instanceof Error ? err.message : '测试失败');
        }
    }
    /** 知识问答：SSE 流式返回（引用来源与 sessionId 见 done 事件）；公开可用但限流 */
    async chat(dto, res, req) {
        if (!Array.isArray(dto.messages) || dto.messages.length === 0) {
            throw new common_1.BadRequestException('messages 不能为空');
        }
        const totalChars = dto.messages.reduce((n, m) => n + m.content.length, 0);
        if (totalChars > 12000) {
            throw new common_1.BadRequestException('消息总长度超过限制（12000 字符）');
        }
        const ip = req.ip ?? 'unknown';
        if (!this.chatLimiter.allow(`chat:${ip}`)) {
            throw new common_1.BadRequestException('提问过于频繁，请稍后再试');
        }
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();
        try {
            const { stream, citations } = await this.llm.answer(dto.messages, dto.skill);
            let full = '';
            for await (const text of stream) {
                full += text;
                res.write(`data: ${JSON.stringify({ text })}\n\n`);
            }
            let sessionId = dto.sessionId;
            try {
                sessionId = await this.llm.saveChatSession(sessionId, dto.messages, full, citations);
            }
            catch {
                /* 会话保存失败不影响回答 */
            }
            res.write(`data: ${JSON.stringify({ done: true, citations, sessionId })}\n\n`);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : '回答失败';
            res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
        }
        res.end();
    }
    /** 问答历史记录（含会话内容，仅管理员可见） */
    sessions() {
        return this.llm.listSessions();
    }
    session(id) {
        return this.llm.getSession(id);
    }
    deleteSession(id) {
        return this.llm.deleteSession(id);
    }
    /** 用量统计：每日 token / 花费 / 限额（仅管理员） */
    usage() {
        return this.llm.getUsage();
    }
    /** 书籍整理：AI 生成摘要/标签/分类/建议问题并写回文章 */
    organize(id) {
        return this.llm.organize(id);
    }
    /** Skill：图片转 Markdown 文章（视觉模型读图成文） */
    imageToMd(id) {
        return this.llm.imageToMarkdown(id);
    }
    /** Skill：PDF/DOCX 转 Markdown 文章 */
    docToMd(id) {
        return this.llm.docToMarkdown(id);
    }
    /** Skill 提示词文件（管理页维护） */
    prompts() {
        return this.config.getPromptFiles();
    }
    async savePrompts(dto) {
        await this.config.savePromptFiles(dto);
        return this.config.getPromptFiles();
    }
    // ========== Skill 库（用户自主增删改 + 一键生成 + 运行） ==========
    skills() {
        return this.config.listSkills();
    }
    async saveSkill(name, dto) {
        if (typeof dto.content !== 'string' || !dto.content.trim()) {
            throw new common_1.BadRequestException('Skill 内容不能为空');
        }
        try {
            const safe = await this.config.saveSkill(name, dto.content, dto.description);
            return this.config.readSkill(safe);
        }
        catch (err) {
            throw new common_1.BadRequestException(err instanceof Error ? err.message : 'Skill 名称无效');
        }
    }
    async deleteSkill(name) {
        try {
            await this.config.deleteSkill(name);
            return { name, deleted: true };
        }
        catch (err) {
            throw new common_1.BadRequestException(err instanceof Error ? err.message : '删除失败');
        }
    }
    /** 元 Skill：按描述一键生成新 Skill */
    generateSkill(dto) {
        return this.llm.generateSkill(dto.name ?? '', dto.description ?? '');
    }
    /** 对文章运行 Skill，生成处理后的新文章 */
    runSkill(name, dto) {
        if (!dto.articleId)
            throw new common_1.BadRequestException('articleId 不能为空');
        return this.llm.runSkill(name, dto.articleId);
    }
    /** 全量重建知识检索索引 */
    reindex() {
        return this.llm.reindex();
    }
};
exports.LlmController = LlmController;
__decorate([
    (0, common_1.Get)('llm/status'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LlmController.prototype, "status", null);
__decorate([
    (0, common_1.Get)('llm/config'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LlmController.prototype, "llmConfig", null);
__decorate([
    (0, common_1.Put)('llm/config'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [UpdateLlmConfigDto]),
    __metadata("design:returntype", Promise)
], LlmController.prototype, "saveConfig", null);
__decorate([
    (0, common_1.Post)('llm/test'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], LlmController.prototype, "testConnection", null);
__decorate([
    (0, common_1.Post)('chat'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ChatDto, Object, Object]),
    __metadata("design:returntype", Promise)
], LlmController.prototype, "chat", null);
__decorate([
    (0, common_1.Get)('chat/sessions'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LlmController.prototype, "sessions", null);
__decorate([
    (0, common_1.Get)('chat/sessions/:id'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], LlmController.prototype, "session", null);
__decorate([
    (0, common_1.Delete)('chat/sessions/:id'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], LlmController.prototype, "deleteSession", null);
__decorate([
    (0, common_1.Get)('llm/usage'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LlmController.prototype, "usage", null);
__decorate([
    (0, common_1.Post)('llm/organize/:id'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], LlmController.prototype, "organize", null);
__decorate([
    (0, common_1.Post)('llm/image-to-md/:id'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], LlmController.prototype, "imageToMd", null);
__decorate([
    (0, common_1.Post)('llm/doc-to-md/:id'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], LlmController.prototype, "docToMd", null);
__decorate([
    (0, common_1.Get)('llm/prompts'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LlmController.prototype, "prompts", null);
__decorate([
    (0, common_1.Put)('llm/prompts'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], LlmController.prototype, "savePrompts", null);
__decorate([
    (0, common_1.Get)('llm/skills'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LlmController.prototype, "skills", null);
__decorate([
    (0, common_1.Put)('llm/skills/:name'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Param)('name')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], LlmController.prototype, "saveSkill", null);
__decorate([
    (0, common_1.Delete)('llm/skills/:name'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Param)('name')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], LlmController.prototype, "deleteSkill", null);
__decorate([
    (0, common_1.Post)('llm/skills/generate'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], LlmController.prototype, "generateSkill", null);
__decorate([
    (0, common_1.Post)('llm/skills/:name/run'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __param(0, (0, common_1.Param)('name')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], LlmController.prototype, "runSkill", null);
__decorate([
    (0, common_1.Post)('llm/reindex'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LlmController.prototype, "reindex", null);
exports.LlmController = LlmController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [llm_service_1.LlmService,
        config_service_1.ConfigService])
], LlmController);
//# sourceMappingURL=llm.controller.js.map