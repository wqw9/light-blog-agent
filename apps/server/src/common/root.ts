import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * 从 cwd 向上查找 monorepo 根目录（含 pnpm-workspace.yaml 的目录）。
 * 服务可能从任意工作目录启动（根目录 / apps/server / 构建产物），统一以此定位 config、uploads、data。
 */
export function findRepoRoot(start = process.cwd()): string {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}
