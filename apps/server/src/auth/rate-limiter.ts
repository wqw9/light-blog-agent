/**
 * 登录限流（内存实现）：同一来源 10 分钟窗口内最多 5 次口令失败，
 * 超过后返回 429；口令正确时清零。个人博客场景足够，无需 Redis。
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 5;

export class RateLimiter {
  private readonly map = new Map<string, { count: number; firstAt: number }>();

  /** 记录一次失败；返回是否仍允许继续尝试 */
  allow(key: string): boolean {
    const now = Date.now();
    const entry = this.map.get(key);
    if (!entry || now - entry.firstAt > WINDOW_MS) {
      this.map.set(key, { count: 1, firstAt: now });
      return true;
    }
    entry.count += 1;
    if (this.map.size > 1000) this.map.clear();
    return entry.count <= MAX_FAILS;
  }

  clear(key: string): void {
    this.map.delete(key);
  }
}
