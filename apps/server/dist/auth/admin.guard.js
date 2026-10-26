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
exports.AdminGuard = void 0;
const common_1 = require("@nestjs/common");
const config_service_1 = require("../config/config.service");
const password_1 = require("./password");
const rate_limiter_1 = require("./rate-limiter");
/**
 * 管理口令守卫（Phase 5 红队加固版）：
 * - config/admin.json 支持明文 password（开发）或 scrypt hash（推荐，用 scripts/hash-password.mjs 生成）
 * - 环境变量 MYBLOG_ADMIN_PASSWORD 优先（验证/CI 注入，不触碰配置文件）
 * - 【fail-closed】未配置口令时一律拒绝写接口（503 + 设置指引），不再"空口令=开放模式"
 * - 同一来源 10 分钟内最多 5 次失败，超过返回 429 防爆破
 */
let AdminGuard = class AdminGuard {
    config;
    limiter = new rate_limiter_1.RateLimiter();
    constructor(config) {
        this.config = config;
    }
    canActivate(context) {
        const credential = this.config.adminCredential;
        if (!credential.password && !credential.hash) {
            throw new common_1.HttpException('管理口令未设置：请编辑 config/admin.json 的 password 字段（首次启动自动转为哈希），或设置环境变量 MYBLOG_ADMIN_PASSWORD 后重启', common_1.HttpStatus.SERVICE_UNAVAILABLE);
        }
        const request = context.switchToHttp().getRequest();
        const token = String(request.headers['x-admin-token'] ?? '');
        const ok = credential.hash ? (0, password_1.verifyPassword)(token, credential.hash) : (0, password_1.safeEqual)(token, credential.password ?? '');
        const key = request.ip ?? 'unknown';
        if (ok) {
            this.limiter.clear(key);
            return true;
        }
        if (!this.limiter.allow(key)) {
            throw new common_1.HttpException('尝试次数过多，请 10 分钟后再试', common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        throw new common_1.UnauthorizedException('需要管理口令');
    }
};
exports.AdminGuard = AdminGuard;
exports.AdminGuard = AdminGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService])
], AdminGuard);
//# sourceMappingURL=admin.guard.js.map