#!/usr/bin/env bash
# 自动部署脚本（服务器执行；由 GitHub Actions 或手动 bash deploy/deploy.sh 调用）
set -euo pipefail

APP_DIR="/opt/myblog"
cd "$APP_DIR"

echo "== 拉取最新代码 =="
git pull --ff-only origin main

echo "== 恢复服务器本地配置（不入库的运行时配置） =="
if compgen -G "deploy/runtime-config/*.json" > /dev/null; then
  cp -f deploy/runtime-config/*.json config/
fi

echo "== 安装依赖并构建 =="
export COREPACK_HOME="$APP_DIR/.corepack"
corepack pnpm install --frozen-lockfile || corepack pnpm install
corepack pnpm build

echo "== 数据库结构同步（新增表自动创建） =="
corepack pnpm --filter @myblog/server db:push

echo "== 重启服务 =="
pm2 startOrReload deploy/ecosystem.config.cjs
pm2 save

echo "✅ 部署完成：$(date '+%F %T')"
