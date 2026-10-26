"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.safeEqual = safeEqual;
/**
 * 口令哈希工具：scrypt 加盐哈希（Node 内置 crypto，无第三方依赖）。
 * 存储格式：scrypt$<salt-hex>$<hash-hex>
 */
const node_crypto_1 = require("node:crypto");
function hashPassword(password) {
    const salt = (0, node_crypto_1.randomBytes)(16).toString('hex');
    const hash = (0, node_crypto_1.scryptSync)(password, salt, 32).toString('hex');
    return `scrypt$${salt}$${hash}`;
}
function verifyPassword(input, stored) {
    try {
        const [scheme, salt, hash] = stored.split('$');
        if (scheme !== 'scrypt' || !salt || !hash)
            return false;
        const candidate = (0, node_crypto_1.scryptSync)(input, salt, 32);
        const expected = Buffer.from(hash, 'hex');
        return candidate.length === expected.length && (0, node_crypto_1.timingSafeEqual)(candidate, expected);
    }
    catch {
        return false;
    }
}
/** 常量时间字符串比较（明文口令直配时使用，长度不同直接失败，避免时序侧信道） */
function safeEqual(a, b) {
    const ba = Buffer.from(a, 'utf-8');
    const bb = Buffer.from(b, 'utf-8');
    if (ba.length !== bb.length)
        return false;
    return (0, node_crypto_1.timingSafeEqual)(ba, bb);
}
//# sourceMappingURL=password.js.map