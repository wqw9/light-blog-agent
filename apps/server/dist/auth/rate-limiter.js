"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiter = void 0;
/**
 * 内存限流器（可参数化窗口与上限）：
 * - 管理口令：同一来源 10 分钟窗口内最多 5 次失败，超过返回 429（防爆破）
 * - 对话接口：同一来源每分钟最多 20 次（防 token 预算滥用）
 * - 阅读计数：同一来源同一文章每小时最多计 3 次（防刷榜）
 * 个人博客场景足够，无需 Redis。
 */
class RateLimiter {
    windowMs;
    maxCount;
    map = new Map();
    constructor(windowMs = 10 * 60 * 1000, maxCount = 5) {
        this.windowMs = windowMs;
        this.maxCount = maxCount;
    }
    /** 记录一次尝试；返回是否仍允许 */
    allow(key) {
        const now = Date.now();
        const entry = this.map.get(key);
        if (!entry || now - entry.firstAt > this.windowMs) {
            this.map.set(key, { count: 1, firstAt: now });
            return true;
        }
        entry.count += 1;
        if (this.map.size > 1000)
            this.map.clear();
        return entry.count <= this.maxCount;
    }
    clear(key) {
        this.map.delete(key);
    }
}
exports.RateLimiter = RateLimiter;
//# sourceMappingURL=rate-limiter.js.map