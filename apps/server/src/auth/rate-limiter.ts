/**
 * 内存限流器（可参数化窗口与上限）：
 * - 管理口令：同一来源 10 分钟窗口内最多 5 次失败，超过返回 429（防爆破）
 * - 对话接口：同一来源每分钟最多 20 次（防 token 预算滥用）
 * - 阅读计数：同一来源同一文章每小时最多计 3 次（防刷榜）
 * 个人博客场景足够，无需 Redis。
 */
export class RateLimiter {
  private readonly map = new Map<string, { count: number; firstAt: number }>();

  constructor(
    private readonly windowMs: number = 10 * 60 * 1000,
    private readonly maxCount: number = 5,
  ) {}

  /** 记录一次尝试；返回是否仍允许 */
  allow(key: string): boolean {
    const now = Date.now();
    const entry = this.map.get(key);
    if (!entry || now - entry.firstAt > this.windowMs) {
      this.map.set(key, { count: 1, firstAt: now });
      return true;
    }
    entry.count += 1;
    if (this.map.size > 1000) this.map.clear();
    return entry.count <= this.maxCount;
  }

  clear(key: string): void {
    this.map.delete(key);
  }
}
