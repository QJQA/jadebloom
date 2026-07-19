#!/bin/zsh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PREVIEW_PORT="8765"

cd "$PROJECT_DIR"

python3 -m http.server "$PREVIEW_PORT" --bind 127.0.0.1 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

sleep 1
open "http://127.0.0.1:$PREVIEW_PORT"

echo ""
echo "JADÉ BLOOM 本地预览已启动"
echo "地址：http://127.0.0.1:$PREVIEW_PORT"
echo "关闭这个窗口即可停止预览。"
echo ""

wait "$SERVER_PID"
