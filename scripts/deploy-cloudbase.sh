#!/usr/bin/env bash
# ============================================================
# scripts/deploy-cloudbase.sh — 一键把站点部署到 CloudBase 静态托管
#
# 前置：
#   npm i -g --prefix ~/.local @cloudbase/cli
#   cloudbase login                      # 浏览器授权（推荐）
#   cloudbase login --apiKeyId xxx --apiKey yyy   # 或 SecretId/SecretKey 非交互登录
#
# 用法：
#   npm run deploy:cloudbase             # 部署到默认环境 /ielts/
#   DRY_RUN=1 npm run deploy:cloudbase   # 只准备文件，不上传
#   CLOUDBASE_ENV_ID=xxx CLOUDBASE_PATH=ielts CLOUDBASE_SITE_URL=https://... npm run deploy:cloudbase
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_ID="${CLOUDBASE_ENV_ID:-ladygaga-d2gssg68j01d8906b}"
CLOUD_PATH="${CLOUDBASE_PATH:-ielts}"
SITE_URL="${CLOUDBASE_SITE_URL:-https://ladygaga-d2gssg68j01d8906b-1472503457.tcloudbaseapp.com}"
STAGE="${TMPDIR:-/tmp}/ielts-cloudbase-deploy"

export PATH="$HOME/.local/bin:$PATH"
if ! command -v cloudbase >/dev/null 2>&1; then
  echo "✗ 未找到 cloudbase 命令。先安装：" >&2
  echo "  npm i -g --prefix ~/.local @cloudbase/cli" >&2
  exit 1
fi

echo "== 生成干净的部署目录（只含站点文件）=="
rm -rf "$STAGE"
mkdir -p "$STAGE"
rsync -a \
  --exclude '.git' --exclude '.vscode' --exclude '.impeccable' \
  --exclude 'docs' --exclude 'scripts' --exclude 'node_modules' \
  --exclude '*.md' --exclude 'package.json' --exclude '.DS_Store' \
  "$ROOT"/ "$STAGE"/

COUNT=$(find "$STAGE" -type f | wc -l | tr -d ' ')
echo "待部署文件：$COUNT 个 → $STAGE"
echo "目标环境：$ENV_ID  路径：/$CLOUD_PATH"

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "DRY_RUN=1，已跳过上传。"
  exit 0
fi

echo "== 上传（发布后自动一致性校验）=="
cloudbase hosting deploy "$STAGE" "$CLOUD_PATH" -e "$ENV_ID" --verify

echo
echo "== 线上版本校验 =="
node "$ROOT/scripts/check-deploy.mjs" "$SITE_URL/$CLOUD_PATH"

cat <<EOF

✓ 部署完成：$SITE_URL/$CLOUD_PATH/
提示：CloudBase 默认域名（*.tcloudbaseapp.com）首次用浏览器打开会先显示腾讯云的
「风险提醒」中间页，点「确定访问」后即可进入；去掉中间页需绑定已备案的自定义域名。
EOF
