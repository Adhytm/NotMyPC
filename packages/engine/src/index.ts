/**
 * 校园网监控引擎 - 入口文件
 *
 * 启动 Hono HTTP 服务,监听指定端口。
 * GUI / CLI / Web Dashboard 都通过 HTTP API 与引擎交互。
 *
 * 启动命令:
 *   npm run dev    (开发模式,热重载)
 *   npm run build  (生产构建)
 *   npm start      (运行构建产物)
 */

import { serve } from '@hono/node-server';
import { createApp } from './server.js';
import { ENGINE_PORT, ENGINE_HOST } from './config.js';

const app = createApp();

console.log(`
╔══════════════════════════════════════════════╗
║  校园网监控引擎 v6.0.0                        ║
║  Campus Network Monitor - TypeScript Edition ║
╚══════════════════════════════════════════════╝
`);

serve(
  {
    fetch: app.fetch,
    port: ENGINE_PORT,
    hostname: ENGINE_HOST,
  },
  (info) => {
    console.log(`[engine] HTTP 服务已启动: http://${ENGINE_HOST}:${info.port}`);
    console.log(`[engine] API 文档:`);
    console.log(`  POST /api/monitor/start   - 启动监控`);
    console.log(`  POST /api/monitor/stop    - 停止监控`);
    console.log(`  GET  /api/monitor/status  - 当前状态`);
    console.log(`  GET  /api/monitor/stream  - SSE 实时事件流`);
    console.log(`  GET  /api/stats/ping      - Ping 统计`);
    console.log(`  GET  /api/stats/http      - HTTP 统计`);
    console.log(`  GET  /api/stats/dns       - DNS 统计`);
    console.log(`  GET  /api/stats/wifi      - Wi-Fi 统计`);
    console.log(`  GET  /api/stats/download  - 下载测速统计`);
    console.log(`  GET  /api/stats/traceroute - 路由追踪诊断历史`);
    console.log(`  GET  /api/stats/snapshots  - 异常快照列表`);
    console.log(`  GET  /api/stats/timeline   - 异常时间轴`);
    console.log(`  GET  /api/stats/impact     - 业务影响记录`);
    console.log(`  GET  /api/export/csv      - 导出 CSV`);
    console.log(`  GET  /api/export/json     - 导出 JSON`);
  }
);

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n[engine] 收到退出信号,正在关闭...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[engine] 收到退出信号,正在关闭...');
  process.exit(0);
});
