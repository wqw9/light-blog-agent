"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrCreateSecretKey = getOrCreateSecretKey;
exports.encryptSecret = encryptSecret;
exports.decryptSecret = decryptSecret;
/**
 * 敏感数据自动加密：AES-256-GCM
 * - 密钥自动生成并保存在 data/secret.key（首次使用时创建，hex 编码 32 字节）
 * - 密文格式：enc:v1:<iv>:<tag>:<cipher>（base64）
 * 用途：config/llm.json 的 apiKey 等敏感配置字段的自动加密存储。
 */
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const ALGO = 'aes-256-gcm';
function getOrCreateSecretKey(dataDir) {
    const path = (0, node_path_1.join)(dataDir, 'secret.key');
    if ((0, node_fs_1.existsSync)(path)) {
        const hex = (0, node_fs_1.readFileSync)(path, 'utf-8').trim();
        if (/^[0-9a-f]{64}$/i.test(hex))
            return Buffer.from(hex, 'hex');
    }
    (0, node_fs_1.mkdirSync)(dataDir, { recursive: true });
    const key = (0, node_crypto_1.randomBytes)(32);
    (0, node_fs_1.writeFileSync)(path, key.toString('hex') + '\n', 'utf-8');
    return key;
}
function encryptSecret(plain, dataDir) {
    const key = getOrCreateSecretKey(dataDir);
    const iv = (0, node_crypto_1.randomBytes)(12);
    const cipher = (0, node_crypto_1.createCipheriv)(ALGO, key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}
function decryptSecret(stored, dataDir) {
    try {
        const parts = stored.split(':');
        if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1')
            return '';
        const key = getOrCreateSecretKey(dataDir);
        const iv = Buffer.from(parts[2], 'base64');
        const tag = Buffer.from(parts[3], 'base64');
        const ciphertext = Buffer.from(parts[4], 'base64');
        const decipher = (0, node_crypto_1.createDecipheriv)(ALGO, key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');
    }
    catch {
        return '';
    }
}
//# sourceMappingURL=encryption.js.map