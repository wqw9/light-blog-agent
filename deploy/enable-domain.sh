#!/usr/bin/env bash
# 域名审核通过后执行：绑定域名并开启自动 HTTPS
#   bash /opt/myblog/deploy/enable-domain.sh
set -euo pipefail

APP_DIR="/opt/myblog"
cd "$APP_DIR"

read -rp "你的域名（例如 blog.example.com）：" DOMAIN
if [ -z "$DOMAIN" ]; then
  echo "域名不能为空，已取消"
  exit 1
fi

sed "s/YOUR-DOMAIN/$DOMAIN/g" deploy/Caddyfile.example > /etc/caddy/Caddyfile
systemctl reload caddy

echo ""
echo "✅ 已启用 https://$DOMAIN（Caddy 自动申请并续期证书）"
echo "接下来别忘了："
echo "  1. 域名解析：A 记录 @ → 服务器公网 IP"
echo "  2. 编辑 /opt/myblog/deploy/runtime-config/site.json，allowedOrigins 改为 [\"https://$DOMAIN\"]"
echo "  3. bash deploy/deploy.sh 使配置生效"
