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
exports.UploadsController = void 0;
const common_1 = require("@nestjs/common");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const admin_guard_1 = require("../auth/admin.guard");
const upload_service_1 = require("./upload.service");
/**
 * 上传记录管理（列表 / 删除 / 重新解析），仅管理口令可用。
 * 原始文件（md/pdf/docx）也仅管理员可下载：公开站只暴露 /uploads/img/ 图片目录，
 * 防止私密文章的原始 Markdown 被未授权直链下载。
 */
let UploadsController = class UploadsController {
    uploads;
    constructor(uploads) {
        this.uploads = uploads;
    }
    list(page, pageSize) {
        return this.uploads.listFiles(Number(page) || 1, Number(pageSize) || 20);
    }
    /** 受控下载原始文件（仅 files/ 目录，白名单文件名，防目录穿越） */
    file(name, res) {
        const safe = (0, node_path_1.basename)(name);
        if (safe !== name || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/.test(safe)) {
            throw new common_1.BadRequestException('文件名无效');
        }
        const full = this.uploads.resolveStoredFile(`files/${safe}`);
        if (!(0, node_fs_1.existsSync)(full))
            throw new common_1.NotFoundException('文件不存在');
        res.sendFile(full, (err) => {
            if (err)
                res.status(404).json({ message: '文件不存在', statusCode: 404 });
        });
    }
    remove(id) {
        return this.uploads.removeFile(id);
    }
    reparse(id) {
        return this.uploads.reparse(id);
    }
};
exports.UploadsController = UploadsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], UploadsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('files/:name'),
    __param(0, (0, common_1.Param)('name')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], UploadsController.prototype, "file", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], UploadsController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':id/reparse'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], UploadsController.prototype, "reparse", null);
exports.UploadsController = UploadsController = __decorate([
    (0, common_1.Controller)('uploads'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:paramtypes", [upload_service_1.UploadService])
], UploadsController);
//# sourceMappingURL=uploads.controller.js.map