// 口令哈希工具自检（scrypt 加盐哈希：格式/正确口令/错误口令/坏格式/盐值随机）
import { hashPassword, verifyPassword } from '../apps/server/src/auth/password';

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    console.log(`  [OK] ${name}`);
  } else {
    failures++;
    console.error(`  [FAIL] ${name}`);
  }
}

const hash = hashPassword('my-secret');
check('哈希格式为 scrypt$salt$hash', hash.startsWith('scrypt$') && hash.split('$').length === 3);
check('正确口令通过验证', verifyPassword('my-secret', hash));
check('错误口令被拒绝', !verifyPassword('wrong-pass', hash));
check('空口令被拒绝', !verifyPassword('', hash));
check('非法格式安全返回 false', !verifyPassword('x', 'not-a-hash'));
check('两次哈希盐值不同', hashPassword('same') !== hashPassword('same'));

if (failures > 0) {
  console.error('VERIFY-SECURITY-FAILED');
  process.exit(1);
}
console.log('VERIFY-SECURITY-PASS');
