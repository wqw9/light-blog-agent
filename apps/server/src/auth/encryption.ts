/**
 * 敏感数据自动加密：AES-256-GCM
 * - 密钥自动生成并保存在 data/secret.key（首次使用时创建，hex 编码 32 字节）
 * - 密文格式：enc:v1:<iv>:<tag>:<cipher>（base64）
 * 用途：config/llm.json 的 apiKey 等敏感配置字段的自动加密存储。
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ALGO = 'aes-256-gcm';

export function getOrCreateSecretKey(dataDir: string): Buffer {
  const path = join(dataDir, 'secret.key');
  if (existsSync(path)) {
    const hex = readFileSync(path, 'utf-8').trim();
    if (/^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, 'hex');
  }
  mkdirSync(dataDir, { recursive: true });
  const key = randomBytes(32);
  writeFileSync(path, key.toString('hex') + '\n', 'utf-8');
  return key;
}

export function encryptSecret(plain: string, dataDir: string): string {
  const key = getOrCreateSecretKey(dataDir);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(stored: string, dataDir: string): string {
  try {
    const parts = stored.split(':');
    if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') return '';
    const key = getOrCreateSecretKey(dataDir);
    const iv = Buffer.from(parts[2], 'base64');
    const tag = Buffer.from(parts[3], 'base64');
    const ciphertext = Buffer.from(parts[4], 'base64');
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');
  } catch {
    return '';
  }
}
