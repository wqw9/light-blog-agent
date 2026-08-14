// 生成管理口令的 scrypt 哈希（粘贴到 config/admin.json 的 "hash" 字段）
// 用法: node scripts/hash-password.mjs <password>
import { randomBytes, scryptSync } from 'node:crypto';

const password = process.argv[2] ?? '';
if (!password) {
  console.error('usage: node scripts/hash-password.mjs <password>');
  process.exit(1);
}

const salt = randomBytes(16).toString('hex');
const hash = scryptSync(password, salt, 32).toString('hex');
console.log(`scrypt$${salt}$${hash}`);
console.log('');
console.log('将上面的字符串填入 config/admin.json: { "hash": "<上面这串>" }');
