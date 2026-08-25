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

echo "== 5/9 拉取代码（大陆服务器直连失败自动走镜像） =="
mkdir -p "$APP_DIR"
cd "$APP_DIR"
USED_MIRROR=0
if [ -d .git ]; then
  git pull --ff-only origin main || true
else
  if ! git clone --depth 1 "$GIT_REPO" . 2>/dev/null; then
    echo "  直连 GitHub 失败，尝试镜像 gh-proxy.com ..."
    if ! git clone --depth 1 "https://gh-proxy.com/${GIT_REPO#https://github.com/}" . 2>/dev/null; then
      echo "  镜像 gh-proxy.com 失败，尝试 ghproxy.net ..."
      git clone --depth 1 "https://ghproxy.net/${GIT_REPO#https://github.com/}" .
    fi
    USED_MIRROR=1
  fi
fi
# 走了镜像时，把之后的 git pull（自动部署）也改写为镜像地址
if [ "$USED_MIRROR" = "1" ]; then
  git config --global url."https://gh-proxy.com/https://github.com/".insteadOf "https://github.com/"
  echo "  >>> 已配置镜像代理：后续自动部署的 git pull 也会走 gh-proxy.com"
fi

echo "== 6/9 目录与运行时配置 =="
mkdir -p deploy/runtime-config data uploads/files uploads/img uploads/tmp uploads/models
# LLM 配置模板 → 本地文件（llm.json 不入库）
if [ ! -f config/llm.json ] && [ -f config/llm.json.example ]; then
  cp config/llm.json.example config/llm.json
fi
# 首次把模板配置复制为"服务器本地配置"（此后每次部署自动恢复，绝不入库）
for f in site.json about.json mascot.json llm.json; do
  if [ -f "config/$f" ] && [ ! -f "deploy/runtime-config/$f" ]; then
    cp "config/$f" "deploy/runtime-config/$f"
  fi
done
# 管理口令：由用户输入（不回显、二次确认、至少 8 位），写入 admin.json 并同步到 runtime-config
if [ -f config/admin.json ]; then
  read -rp "检测到已有管理口令，是否重新设置？(y/N): " RESET_ANS
  if [ "$RESET_ANS" = "y" ] || [ "$RESET_ANS" = "Y" ]; then
    rm -f config/admin.json
  fi
fi
if [ ! -f config/admin.json ]; then
  while true; do
    read -rsp "设置管理口令（输入不显示，至少 8 位）：" PW1; echo
    read -rsp "再次输入确认：" PW2; echo
    if [ -n "$PW1" ] && [ "$PW1" = "$PW2" ] && [ "${#PW1}" -ge 8 ]; then
      break
    fi
    echo "两次输入不一致或长度不足 8 位，请重试"
  done
  printf '{"password":"%s"}\n' "$PW1" > config/admin.json
  echo ">>> 管理口令已设置（首次启动自动转为哈希，配置文件不入库）"
fi
# 同步到服务器本地配置（每次部署自动恢复，git 中无此文件）
mkdir -p deploy/runtime-config
cp config/admin.json deploy/runtime-config/admin.json

# 数据库连接配置（不入库）：Prisma 与运行时都需要
if [ ! -f apps/server/.env ]; then
  printf '# Prisma 相对路径基于 schema 文件位置（apps/server/prisma/）解析\nDATABASE_URL="file:../../../data/myblog.db"\nPORT=3000\n' > apps/server/.env
  echo ">>> 已创建 apps/server/.env（数据库连接配置）"
fi

echo "== 7/9 Caddy 配置（域名可选） =="
read -rp "你的域名（还在审核就留空回车，先用 http://服务器IP 预览）：" DOMAIN
# 容错：自动剥掉 http(s):// 前缀与末尾斜杠
DOMAIN="$(echo "$DOMAIN" | sed -e 's|^https\?://||' -e 's|/$||')"
if [ -n "$DOMAIN" ]; then
  sed "s|YOUR-DOMAIN|$DOMAIN|g" deploy/Caddyfile.example > /etc/caddy/Caddyfile
  echo ">>> 已启用域名模式 https://$DOMAIN"
else
  # 预览模式：80 端口明文 HTTP，无证书（域名审核通过后运行 deploy/enable-domain.sh 切换）
  cat > /etc/caddy/Caddyfile <<'EOF'
:80 {
	encode gzip
	root * /opt/myblog/apps/web/dist
	try_files {path} /index.html
	handle /api/* {
		reverse_proxy 127.0.0.1:3000
	}
	handle /uploads/* {
		reverse_proxy 127.0.0.1:3000
	}
}
EOF
  echo ">>> 预览模式：http://服务器IP（审核通过后运行 deploy/enable-domain.sh 开启 HTTPS）"
fi
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
echo "  - 管理口令：你刚设置的口令（忘记可重跑本脚本选择重新设置）"
echo "  - 之后每次向 GitHub 推送 main 分支，GitHub Actions 会自动执行部署"
