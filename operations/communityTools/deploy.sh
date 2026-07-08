#!/usr/bin/env bash
# 大玩家社区工具台 —— 发布到 https://chat.q1.com/apps/clubtools/
# 用法：DEPLOY_TOKEN=你的部署token bash deploy.sh
# 说明：zip 根目录须含 index.html；上传后经主管/管理员钉钉或签审批后 live。
set -euo pipefail

APPNAME="clubtools"
BAAS="https://chat.q1.com/baas"
cd "$(dirname "$0")"

if [ -z "${DEPLOY_TOKEN:-}" ]; then
  echo "错误：请先设置部署 token —— DEPLOY_TOKEN=xxx bash deploy.sh" >&2
  exit 1
fi

trap 'rm -f app.zip' EXIT   # 无论成功/失败都清理临时包，避免误提交

zip -j app.zip index.html
echo "已打包 app.zip，开始上传到 $APPNAME ..."
curl -fsS -H "X-Deploy-Token: $DEPLOY_TOKEN" -F file=@app.zip \
  "$BAAS/v1/hosting/$APPNAME/versions"
echo
echo "上传完成。等待审批通过后访问：https://chat.q1.com/apps/$APPNAME/"
