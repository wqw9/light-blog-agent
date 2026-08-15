#!/usr/bin/env bash
# 一键初始化服务器（Ubuntu 22.04/24.04，root 执行）：
#   bash deploy/setup-server.sh [Git仓库地址]
# 默认仓库：https://github.com/wqw9/light-blog-agent.git
set -euo pipefail

GIT_REPO="${1:-https://github.com/wqw9/light-blog-agent.git}"
APP_DIR="/opt/myblog"

echo "== 1/9 系统依赖 =="
apt-get update -y
apt-get install -y git curl build-essential ca-certificates gnupg ufw jq openssl

echo "== 2/9 Node.js 22 (LTS) =="
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
corepack enable pnpm

echo "== 3/9 pm2 进程守护 =="
npm install -g pm2

echo "== 4/9 Caddy（自动 HTTPS） =="
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "== 5/9 拉取代码 =="
mkdir -p "$APP_DIR"
cd "$APP_DIR"
if [ ! -d .git ]; then
  git clone "$GIT_REPO" .
else
  git pull --ff-only origin main || true
fi

echo "== 6/9 目录与运行时配置 =="
mkdir -p deploy/runtime-config data uploads/files uploads/img uploads/tmp uploads/models
# 首次把模板配置复制为"服务器本地配置"（此后每次部署自动恢复，绝不入库）
for f in site.json about.json mascot.json llm.json; do
  if [ -f "config/$f" ] && [ ! -f "deploy/runtime-config/$f" ]; then
    cp "config/$f" "deploy/runtime-config/$f"
  fi
done
# 管理口令：生成随机口令（启动时自动转为 scrypt 哈希；config/admin.json 不入库）
if [ ! -f config/admin.json ]; then
  PWD_GEN="$(openssl rand -hex 12)"
  printf '{"password":"%s"}\n' "$PWD_GEN" > config/admin.json
  echo ">>> 已生成随机管理口令：$PWD_GEN  （请立即记下！管理页登录用）"
fi

echo "== 7/9 Caddy 配置（域名） =="
read -rp "你的域名（例如 blog.example.com）：" DOMAIN
sed "s/YOUR-DOMAIN/$DOMAIN/g" deploy/Caddyfile.example > /etc/caddy/Caddyfile
systemctl enable --now caddy
systemctl reload caddy

echo "== 8/9 防火墙（仅 22/80/443；后端 3000 不对公网开放） =="
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "== 9/9 首次构建部署 =="
bash deploy/deploy.sh
pm2 startup systemd -u root --hp /root || true
pm2 save

echo ""
echo "✅ 服务器初始化完成！"
echo "  - 站点目录：$APP_DIR"
echo "  - 访问：https://$DOMAIN"
echo "  - 管理口令：见上方生成的随机口令（忘记可重设 config/admin.json）"
echo "  - 之后每次向 GitHub 推送 main 分支，GitHub Actions 会自动执行部署"
