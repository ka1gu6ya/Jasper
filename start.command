#!/bin/bash
# TrailNote 启动器 —— 双击即可运行
# 作用：在本机起一个静态服务器并打开浏览器。
# 之所以需要服务器：这是 PWA，Service Worker 和 ES 模块都不能在 file:// 下工作。

cd "$(dirname "$0")" || exit 1
PORT=${1:-8123}

# 端口被占用时自动 +1 找一个空的
while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
  if [ "$PORT" -gt 8200 ]; then
    echo "找不到可用端口，已放弃。"
    exit 1
  fi
done

URL="http://127.0.0.1:$PORT/"

echo ""
echo "  TrailNote · 旅行工作台"
echo "  ──────────────────────────────"
echo "  地址: $URL"
echo "  数据保存在这台设备的浏览器里，不上传任何服务器。"
echo ""
echo "  关闭这个窗口即可停止服务（数据不会丢）。"
echo ""

# 稍等服务器起来再打开浏览器
( sleep 0.8; open "$URL" ) &
exec python3 -m http.server "$PORT" --bind 127.0.0.1
