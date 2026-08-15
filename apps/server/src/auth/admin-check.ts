import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { safeEqual, verifyPassword } from './password';

/**
 * 只读管理口令校验（不参与登录限流）：
 * 供公开接口做"按访问者身份返回可见内容"的分流 ——
 * 持有有效口令的请求可以看到私密/草稿内容，普通访问者只能看到公开内容。
 *
 * 安全语义（fail-closed）：
 * - 未配置口令（password 与 hash 均空）→ 一律视为非管理员，且写接口会直接拒绝
 * - 配置文件损坏 → 同样视为非管理员，绝不默认放行
 */
@Injectable()
export class AdminCheckService {
  constructor(private readonly config: ConfigService) {}

  isAdmin(headers: Record<string, string | undefined>): boolean {
    const credential = this.config.adminCredential;
    if (!credential.password && !credential.hash) return false;
    const token = String(headers['x-admin-token'] ?? '');
    if (!token) return false;
    if (credential.hash) return verifyPassword(token, credential.hash);
    if (!credential.password) return false;
    return safeEqual(token, credential.password);
  }
}
