#!/usr/bin/env bash
# 演示专用后台 —— 发布到 https://chat.q1.com/apps/gptdisplay/
#   C 端（演示页，人人可用）: https://chat.q1.com/apps/gptdisplay/
#   B 端（管理后台，仅管理员）: https://chat.q1.com/apps/gptdisplay/admin.html
# 用法：DEPLOY_TOKEN=你的部署token bash deploy.sh
# 说明：zip 根目录须含 index.html；打包 index.html + admin.html + store.js + vendor/。
#       上传后经主管/管理员钉钉或签审批后 live。
set -euo pipefail

APPNAME="gptdisplay"
BAAS="https://chat.q1.com/baas"
cd "$(dirname "$0")"

if [ -z "${DEPLOY_TOKEN:-}" ]; then
  echo "错误：请先设置部署 token —— DEPLOY_TOKEN=xxx bash deploy.sh" >&2
  exit 1
fi

trap 'rm -f app.zip' EXIT   # 无论成功/失败都清理临时包，避免误提交

rm -f app.zip
# -r 递归带上 vendor/；只收前端资源，排除脚本与临时文件自身
zip -r app.zip index.html admin.html store.js vendor \
  -x '*/.*' 'app.zip' 'deploy.sh' >/dev/null
echo "已打包 app.zip：$(unzip -l app.zip | tail -1)"
echo "开始上传到 $APPNAME ..."
curl -fsS -H "X-Deploy-Token: $DEPLOY_TOKEN" -F file=@app.zip \
  "$BAAS/v1/hosting/$APPNAME/versions"
echo
echo "上传完成。等待审批通过后访问："
echo "  C 端: https://chat.q1.com/apps/$APPNAME/"
echo "  B 端: https://chat.q1.com/apps/$APPNAME/admin.html"
