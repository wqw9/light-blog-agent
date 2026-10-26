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
exports.AdminCheckService = void 0;
const common_1 = require("@nestjs/common");
const config_service_1 = require("../config/config.service");
const password_1 = require("./password");
/**
 * 只读管理口令校验（不参与登录限流）：
 * 供公开接口做"按访问者身份返回可见内容"的分流 ——
 * 持有有效口令的请求可以看到私密/草稿内容，普通访问者只能看到公开内容。
 *
 * 安全语义（fail-closed）：
 * - 未配置口令（password 与 hash 均空）→ 一律视为非管理员，且写接口会直接拒绝
 * - 配置文件损坏 → 同样视为非管理员，绝不默认放行
 */
let AdminCheckService = class AdminCheckService {
    config;
    constructor(config) {
        this.config = config;
    }
    isAdmin(headers) {
        const credential = this.config.adminCredential;
        if (!credential.password && !credential.hash)
            return false;
        const token = String(headers['x-admin-token'] ?? '');
        if (!token)
            return false;
        if (credential.hash)
            return (0, password_1.verifyPassword)(token, credential.hash);
        if (!credential.password)
            return false;
        return (0, password_1.safeEqual)(token, credential.password);
    }
};
exports.AdminCheckService = AdminCheckService;
exports.AdminCheckService = AdminCheckService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService])
], AdminCheckService);
//# sourceMappingURL=admin-check.js.map