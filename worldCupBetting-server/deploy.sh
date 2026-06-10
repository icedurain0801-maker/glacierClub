#!/usr/bin/env bash
# ============================================================
# 世界杯竞猜后端 —— 腾讯云轻量服务器一键部署脚本
#   公网 IP: 43.156.130.10 (新加坡，境外免备案)
#
# 用法：SSH 登录服务器后，进入 worldCupBetting-server 目录执行：
#     sudo bash deploy.sh
#
# 脚本全自动完成：装 MySQL、装 Node、建库建表、装 pm2、启动常驻。
# 数据库密码默认随机生成并写进 .env，无需手动配置。
# ============================================================
set -e

DB_NAME="wc2026_betting"
DB_USER="wcuser"
# 数据库密码：首次运行随机生成；重复运行复用 .env 里已有的
if [ -f .env ] && grep -q '^DB_PASSWORD=' .env; then
  DB_PASS=$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)
fi
DB_PASS=${DB_PASS:-"Wc$(date +%s | sha256sum | head -c 16)!"}

echo "==> [1/7] 安装 MySQL / Node.js（自动识别系统）"
if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y mysql-server curl
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  apt-get install -y nodejs
  systemctl enable mysql && systemctl start mysql
elif command -v yum >/dev/null 2>&1; then
  yum install -y mysql-server curl || yum install -y mariadb-server curl
  curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
  yum install -y nodejs
  systemctl enable mysqld 2>/dev/null && systemctl start mysqld 2>/dev/null || \
  (systemctl enable mariadb && systemctl start mariadb)
else
  echo "!! 未识别的系统，请手动安装 MySQL 和 Node.js 18+ 后重试"; exit 1
fi
echo "    Node 版本：$(node -v)"

echo "==> [2/7] 创建数据库和账号"
mysql <<SQL || mysql -uroot <<SQL
CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

echo "==> [3/7] 生成 .env 配置"
JWT=$(head -c 32 /dev/urandom | sha256sum | head -c 32)
cat > .env <<ENV
DB_HOST=localhost
DB_PORT=3306
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASS}
DB_SSL=false

JWT_SECRET=${JWT}
JWT_EXPIRES_IN=7d

PORT=3000

ADMIN_USERNAME=admin
ADMIN_PASSWORD=Admin123!
ENV

echo "==> [4/7] 安装项目依赖"
npm install --production

echo "==> [5/7] 初始化数据库（建表 + 种子赛程）"
npm run migrate

echo "==> [6/7] 安装 pm2 并启动后端"
npm install -g pm2 >/dev/null 2>&1 || true
pm2 delete wc-server >/dev/null 2>&1 || true
pm2 start src/app.js --name wc-server
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null | tail -1 | bash || true

echo "==> [7/7] 自检"
sleep 2
curl -s "http://localhost:3000/api/ping" && echo ""
echo ""
echo "============================================================"
echo " 部署完成！数据库账号已自动生成并写入 .env。"
echo " 管理员账号：admin / Admin123!（建议登录后改）"
echo ""
echo " 还差最后一步（在腾讯云控制台点）："
echo "   防火墙 → 添加规则 → 放行 TCP:3000"
echo " 然后浏览器访问： http://43.156.130.10:3000/api/ping"
echo " 返回 {\"ok\":true} 就成功了。"
echo "============================================================"
