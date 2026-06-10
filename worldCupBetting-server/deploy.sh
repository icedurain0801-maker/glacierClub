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

install_node() {
  # 已装就跳过
  if command -v node >/dev/null 2>&1; then echo "    Node 已安装：$(node -v)"; return 0; fi
  # 优先用系统自带源（OpenCloudOS / TencentOS / 较新 CentOS / Ubuntu 都自带 nodejs 包）
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y nodejs npm && return 0
  elif command -v yum >/dev/null 2>&1; then
    yum install -y nodejs npm && return 0
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get install -y nodejs npm && return 0
  fi
  return 1
}

if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y mysql-server curl
  systemctl enable mysql && systemctl start mysql
elif command -v dnf >/dev/null 2>&1 || command -v yum >/dev/null 2>&1; then
  PKG=$(command -v dnf || command -v yum)
  $PKG install -y mysql-server curl || $PKG install -y mariadb-server curl
  systemctl enable mysqld 2>/dev/null && systemctl start mysqld 2>/dev/null || \
  (systemctl enable mariadb 2>/dev/null && systemctl start mariadb 2>/dev/null) || true
else
  echo "!! 未识别的系统，请手动安装 MySQL 和 Node.js 18+ 后重试"; exit 1
fi

install_node || { echo "!! Node.js 安装失败，请手动执行: dnf install -y nodejs npm"; exit 1; }
echo "    Node 版本：$(node -v)"

echo "==> [2/7] 创建数据库和账号"
SQL_INIT="CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;"
# 优先用 root 无密码 socket 登录；失败再试常见情况
mysql -uroot -e "$SQL_INIT" 2>/dev/null \
  || mysql -e "$SQL_INIT" 2>/dev/null \
  || { echo "!! 数据库初始化失败：root 可能已设密码。请手动执行下面的 SQL 后重跑脚本："; echo "$SQL_INIT"; exit 1; }

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
