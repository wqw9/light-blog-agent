"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findRepoRoot = findRepoRoot;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
/**
 * 从 cwd 向上查找 monorepo 根目录（含 pnpm-workspace.yaml 的目录）。
 * 服务可能从任意工作目录启动（根目录 / apps/server / 构建产物），统一以此定位 config、uploads、data。
 */
function findRepoRoot(start = process.cwd()) {
    let dir = start;
    for (let i = 0; i < 6; i++) {
        if ((0, node_fs_1.existsSync)((0, node_path_1.join)(dir, 'pnpm-workspace.yaml')))
            return dir;
        const parent = (0, node_path_1.resolve)(dir, '..');
        if (parent === dir)
            break;
        dir = parent;
    }
    return start;
}
//# sourceMappingURL=root.js.map