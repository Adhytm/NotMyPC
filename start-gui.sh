#!/usr/bin/env bash
set -e

echo "========================================================"
echo "  校园网质量深度监控系统 (Campus Network Monitor)"
echo "========================================================"

if ! command -v node >/dev/null 2>&1; then
    echo "[错误] 未检测到 Node.js 环境，请先安装 Node.js (推荐 18+ 或 20+)"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "[提示] 首次运行，正在安装依赖包 (npm install)..."
    npm install
fi

echo "[1/2] 正在启动监控引擎与 Web 控制台..."
echo "[2/2] 请在浏览器打开: http://localhost:3002"
echo ""

npm run dev
