/**
 * API Client
 *
 * GUI 与引擎交互的唯一方式。
 * 完全不知道底层 ping/http/dns 怎么实现,只知道 HTTP 端点。
 * 开发时通过 Next.js rewrites 代理到 localhost:3001。
 */

const API_BASE = '/api';

/** 监控配置 (与 engine types.ts 对齐) */
export interface MonitorConfig {
  pingTargets?: Array<{ name: string; host: string }>;
  httpTargets?: Array<{ name: string; url: string }>;
  dnsDomains?: string[];
  pingInterval?: number;
  httpInterval?: number;
  dnsInterval?: number;
  downloadInterval?: number;
  wifiInterval?: number;
  summaryInterval?: number;
  spikeThresholdMs?: number;
}

export const api = {
  /** 启动监控 */
  startMonitor: (config?: Partial<MonitorConfig>) =>
    fetch(`${API_BASE}/monitor/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config ?? {}),
    }).then((r) => r.json()),

  /** 停止监控 */
  stopMonitor: () =>
    fetch(`${API_BASE}/monitor/stop`, { method: 'POST' }).then((r) => r.json()),

  /** 获取引擎状态 */
  getStatus: () =>
    fetch(`${API_BASE}/monitor/status`).then((r) => r.json()),

  /** 获取自动发现的默认网关 */
  getGateway: () =>
    fetch(`${API_BASE}/network/gateway`).then((r) => r.json()),

  /** 创建 SSE 事件流 */
  streamEvents: () => new EventSource(`${API_BASE}/monitor/stream`),

  /** 获取 Ping 统计 */
  getPingStats: () =>
    fetch(`${API_BASE}/stats/ping`).then((r) => r.json()),

  /** 获取 HTTP 统计 */
  getHttpStats: () =>
    fetch(`${API_BASE}/stats/http`).then((r) => r.json()),

  /** 获取 DNS 统计 */
  getDnsStats: () =>
    fetch(`${API_BASE}/stats/dns`).then((r) => r.json()),

  /** 获取 Wi-Fi 统计 */
  getWifiStats: () =>
    fetch(`${API_BASE}/stats/wifi`).then((r) => r.json()),

  /** 获取下载测速统计 */
  getDownloadStats: () =>
    fetch(`${API_BASE}/stats/download`).then((r) => r.json()),

  /** 获取路由追踪诊断历史 */
  getTracerouteRecords: () =>
    fetch(`${API_BASE}/stats/traceroute`).then((r) => r.json()),

  /** 获取异常快照列表 */
  getSnapshots: () =>
    fetch(`${API_BASE}/stats/snapshots`).then((r) => r.json()),

  /** 获取异常事件列表 */
  getAnomalies: () =>
    fetch(`${API_BASE}/stats/anomalies`).then((r) => r.json()),

  /** 获取异常时间轴事件列表 */
  getTimeline: () =>
    fetch(`${API_BASE}/stats/timeline`).then((r) => r.json()),

  /** 获取业务影响记录列表 */
  getImpactRecords: () =>
    fetch(`${API_BASE}/stats/impact`).then((r) => r.json()),

  /** 导出 CSV (返回下载链接) */
  exportCsvUrl: () => `${API_BASE}/export/csv`,

  /** 导出 JSON (返回下载链接) */
  exportJsonUrl: () => `${API_BASE}/export/json`,

  /** 导出 JSON (fetch 解析后数据) */
  exportJson: () =>
    fetch(`${API_BASE}/export/json`).then((r) => r.json()),
};
