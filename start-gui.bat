@echo off
chcp 65001 >nul
title 校园网质量深度监控 - Web GUI 启动器
echo ========================================================
echo   校园网质量深度监控系统 (Campus Network Monitor)
echo   正在检查依赖并启动前后端服务...
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js 环境，请先安装 Node.js (推荐 18+ 或 20+)：
    echo 官网下载：https://nodejs.org/
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [提示] 首次运行，正在安装依赖包 (npm install)...
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败，请检查网络后重试。
        pause
        exit /b 1
    )
)

echo [1/2] 正在启动监控引擎 (端口 3001) 与 Web 控制台 (端口 3002)...
echo [2/2] 服务启动后请在浏览器打开: http://localhost:3002
echo.
echo 按 Ctrl+C 可停止监控。
echo ========================================================
echo.

call npm run dev

pause
