#!/usr/bin/env bash
# 自动部署脚本（服务器执行；由 GitHub Actions 或手动 bash deploy/deploy.sh 调用）
set -euo pipefail

APP_DIR="/opt/myblog"
RUNTIME_DIR="deploy/runtime-config"
cd "$APP_DIR"
mkdir -p "$RUNTIME_DIR"

# ---------------------------------------------------------------------------
# 1) 先快照「服务器上正在生效的配置」到 runtime-config
#    包括管理页里改过的 site/about/mascot/llm/friends，以及管理页「LLM 设置」里
#    编辑过的提示词 config/prompts/*.md。快照之后才能安全地清理 config/ 的本地改动。
# ---------------------------------------------------------------------------
echo "== 快照服务器本地配置 =="
if compgen -G "config/*.json" > /dev/null; then
  cp -f config/*.json "$RUNTIME_DIR"/
fi
if compgen -G "config/prompts/*.md" > /dev/null; then
  mkdir -p "$RUNTIME_DIR/prompts"
  cp -f config/prompts/*.md "$RUNTIME_DIR/prompts/"
fi

# ---------------------------------------------------------------------------
# 2) 清掉 config/ 里受版本控制的本地改动
#    原因：上一次部署把 runtime-config 覆盖回了 config/，这些文件因此长期处于
#    "已修改" 状态；一旦新提交也改到同一个文件（例如 site.json / prompts），
#    git pull 会直接报 "local changes would be overwritten" 并中断部署。
#    真值上面已经快照，这里清理不会丢数据；uploads/ data/ runtime-config/ 均不受影响。
# ---------------------------------------------------------------------------
echo "== 清理受控配置的本地改动 =="
git checkout -- config/ 2>/dev/null || true

echo "== 拉取最新代码 =="
git pull --ff-only origin main

# ---------------------------------------------------------------------------
# 3) 还原服务器本地配置（不入库的运行时真值：服务器值优先于仓库模板）
# ---------------------------------------------------------------------------
echo "== 恢复服务器本地配置（不入库的运行时配置） =="
if compgen -G "$RUNTIME_DIR/*.json" > /dev/null; then
  cp -f "$RUNTIME_DIR"/*.json config/
fi
if compgen -G "$RUNTIME_DIR/prompts/*.md" > /dev/null; then
  cp -f "$RUNTIME_DIR/prompts"/*.md config/prompts/
fi

# ---------------------------------------------------------------------------
# 4) 站点导航补齐（幂等）：老站点的 site.json 里没有新功能页的导航项时补一条。
#    只追加 / 插入，绝不改动已有条目；站点没启用友链（无 config/friends.json）则跳过。
# ---------------------------------------------------------------------------
echo "== 站点导航补齐（友链） =="
node - <<'NODE'
const fs = require('fs');
const file = 'config/site.json';
try {
  if (!fs.existsSync('config/friends.json')) {
    console.log('  跳过：站点没有 config/friends.json');
    process.exit(0);
  }
  const site = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const nav = Array.isArray(site.nav) ? site.nav : [];
  const norm = (p) => String(p || '').replace(/\/+$/, '');
  if (nav.some((item) => item && norm(item.path) === '/friends')) {
    console.log('  导航里已有「友链」');
    process.exit(0);
  }
  const entry = { label: '友链', path: '/friends' };
  const at = nav.findIndex((item) => item && norm(item.path) === '/about');
  if (at >= 0) nav.splice(at, 0, entry);
  else nav.push(entry);
  site.nav = nav;
  fs.writeFileSync(file, JSON.stringify(site, null, 2) + '\n', 'utf-8');
  console.log('  已把「友链」加入站点导航');
} catch (err) {
  console.log('  跳过导航补齐：' + err.message);
}
NODE

# ---------------------------------------------------------------------------
# 5) 把（可能刚被补齐/新增的）配置回写 runtime-config，保证下次部署不丢、不被覆盖
# ---------------------------------------------------------------------------
if compgen -G "config/*.json" > /dev/null; then
  cp -f config/*.json "$RUNTIME_DIR"/
fi
if compgen -G "config/prompts/*.md" > /dev/null; then
  cp -f config/prompts/*.md "$RUNTIME_DIR/prompts/"
fi

echo "== 安装依赖并构建 =="
export COREPACK_HOME="$APP_DIR/.corepack"
# Prisma 引擎默认从国外源下载，大陆服务器经常超时；默认走 npmmirror 镜像（可用环境变量覆盖）
export PRISMA_ENGINES_MIRROR="${PRISMA_ENGINES_MIRROR:-https://npmmirror.com/mirrors/prisma}"
corepack pnpm install --frozen-lockfile || corepack pnpm install
corepack pnpm build

echo "== 数据库结构同步（新增表自动创建） =="
# .env 不入库：缺失时补默认连接配置
if [ ! -f apps/server/.env ]; then
  printf '# Prisma 相对路径基于 schema 文件位置（apps/server/prisma/）解析\nDATABASE_URL="file:../../../data/myblog.db"\nPORT=3000\n' > apps/server/.env
fi
corepack pnpm --filter @myblog/server db:push

echo "== 重启服务 =="
pm2 startOrReload deploy/ecosystem.config.cjs
pm2 save

echo "✅ 部署完成：$(date '+%F %T')"
