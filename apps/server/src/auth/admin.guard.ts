import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { safeEqual, verifyPassword } from './password';
import { RateLimiter } from './rate-limiter';

/**
 * 管理口令守卫（Phase 5 红队加固版）：
 * - config/admin.json 支持明文 password（开发）或 scrypt hash（推荐，用 scripts/hash-password.mjs 生成）
 * - 环境变量 MYBLOG_ADMIN_PASSWORD 优先（验证/CI 注入，不触碰配置文件）
 * - 【fail-closed】未配置口令时一律拒绝写接口（503 + 设置指引），不再"空口令=开放模式"
 * - 同一来源 10 分钟内最多 5 次失败，超过返回 429 防爆破
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly limiter = new RateLimiter();

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const credential = this.config.adminCredential;
    if (!credential.password && !credential.hash) {
      throw new HttpException(
        '管理口令未设置：请编辑 config/admin.json 的 password 字段（首次启动自动转为哈希），或设置环境变量 MYBLOG_ADMIN_PASSWORD 后重启',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      ip?: string;
    }>();
    const token = String(request.headers['x-admin-token'] ?? '');
    const ok = credential.hash ? verifyPassword(token, credential.hash) : safeEqual(token, credential.password ?? '');

    const key = request.ip ?? 'unknown';
    if (ok) {
      this.limiter.clear(key);
      return true;
    }
    if (!this.limiter.allow(key)) {
      throw new HttpException('尝试次数过多，请 10 分钟后再试', HttpStatus.TOO_MANY_REQUESTS);
    }
    throw new UnauthorizedException('需要管理口令');
  }
}
