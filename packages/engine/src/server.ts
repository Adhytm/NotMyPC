/**
 * Hono HTTP 服务
 *
 * 提供 REST API 和 SSE 实时推送。
 * GUI / CLI / Web Dashboard 都通过此 HTTP 接口与引擎交互,
 * 不直接依赖任何引擎内部实现。
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import {
  startMonitor,
  stopMonitor,
  getState,
  getPingStatistics,
  getHttpStatistics,
  getDnsStatistics,
  getWifiStatistics,
  getDownloadStatistics,
  getAnomalies,
  getDiagnosisRecords,
  getSnapshotRecords,
  getTimelineRecords,
  getImpactRecordsList,
  subscribe,
} from './engine.js';
import { exportCsv } from './export/csv.js';
import { exportJson } from './export/json.js';
import { detectDefaultGateway, getCachedGateway } from './core/gateway.js';

export function createApp(): Hono {
  const app = new Hono();

  // CORS: 允许 GUI (localhost:3000) 跨域访问
  app.use(
    '*',
    cors({
      origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3002', 'http://127.0.0.1:3002'],
      allowMethods: ['GET', 'POST'],
    })
  );

  // ============================================================
  // 监控控制 API
  // ============================================================

  /** POST /api/monitor/start - 启动监控 */
  app.post('/api/monitor/start', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      await startMonitor(body);
      return c.json({ ok: true, message: '监控已启动' });
    } catch (e: any) {
      return c.json({ ok: false, message: e?.message ?? String(e) }, 500);
    }
  });

  /** POST /api/monitor/stop - 停止监控 */
  app.post('/api/monitor/stop', (c) => {
    stopMonitor();
    return c.json({ ok: true, message: '监控已停止' });
  });

  /** GET /api/monitor/status - 当前运行状态 + 配置 */
  app.get('/api/monitor/status', (c) => {
    return c.json(getState());
  });

  /** GET /api/network/gateway - 自动发现的默认网关 (便于 GUI 展示当前网络环境) */
  app.get('/api/network/gateway', async (c) => {
    const gateway = getCachedGateway() ?? (await detectDefaultGateway());
    return c.json({ gateway });
  });

  // ============================================================
  // SSE 实时事件流
  // ============================================================

  /** GET /api/monitor/stream - SSE 实时事件流 */
  app.get('/api/monitor/stream', (c) => {
    return streamSSE(c, async (stream) => {
      // 订阅引擎事件
      const unsubscribe = subscribe(async (event) => {
        try {
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event.data),
            id: event.timestamp,
          });
        } catch {
          // 流已关闭,忽略
        }
      });

      // 发送心跳保持连接
      const heartbeat = setInterval(async () => {
        try {
          await stream.writeSSE({ event: 'heartbeat', data: '' });
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);

      // 流关闭时清理
      stream.onAbort(() => {
        unsubscribe();
        clearInterval(heartbeat);
      });

      // 保持流开启 (直到客户端断开)
      await new Promise(() => {});
    });
  });

  // ============================================================
  // 统计查询 API
  // ============================================================

  /** GET /api/stats/ping - Ping 汇总统计 */
  app.get('/api/stats/ping', (c) => {
    return c.json(getPingStatistics());
  });

  /** GET /api/stats/http - HTTP 汇总统计 */
  app.get('/api/stats/http', (c) => {
    return c.json(getHttpStatistics());
  });

  /** GET /api/stats/dns - DNS 汇总统计 */
  app.get('/api/stats/dns', (c) => {
    return c.json(getDnsStatistics());
  });

  /** GET /api/stats/wifi - Wi-Fi 状态 + 漫游历史 */
  app.get('/api/stats/wifi', (c) => {
    return c.json(getWifiStatistics());
  });

  /** GET /api/stats/download - 下载测速统计 */
  app.get('/api/stats/download', (c) => {
    return c.json(getDownloadStatistics());
  });

  /** GET /api/stats/anomalies - 异常事件列表 */
  app.get('/api/stats/anomalies', (c) => {
    return c.json(getAnomalies());
  });

  /** GET /api/stats/traceroute - 路由追踪诊断历史 */
  app.get('/api/stats/traceroute', (c) => {
    return c.json(getDiagnosisRecords());
  });

  /** GET /api/stats/snapshots - 异常快照列表 */
  app.get('/api/stats/snapshots', (c) => {
    return c.json(getSnapshotRecords());
  });

  /** GET /api/stats/timeline - 异常时间轴事件列表 */
  app.get('/api/stats/timeline', (c) => {
    return c.json(getTimelineRecords());
  });

  /** GET /api/stats/impact - 业务影响记录列表 */
  app.get('/api/stats/impact', (c) => {
    return c.json(getImpactRecordsList());
  });

  // ============================================================
  // 数据导出 API
  // ============================================================

  /** GET /api/export/csv - 下载 CSV */
  app.get('/api/export/csv', (c) => {
    const csv = exportCsv();
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', 'attachment; filename="network-monitor.csv"');
    return c.body(csv);
  });

  /** GET /api/export/json - 下载 JSON */
  app.get('/api/export/json', (c) => {
    const json = exportJson();
    c.header('Content-Disposition', 'attachment; filename="network-monitor.json"');
    return c.json(json);
  });

  return app;
}
