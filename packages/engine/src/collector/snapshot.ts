/**
 * 异常快照采集器
 *
 * 在网络异常时一次性抓取所有网络状态, 生成可供运维直接采信的「现场保全」证据。
 * 对应 ping.py 中的 capture_anomaly_snapshot 函数。
 *
 * 采集内容:
 *   1. 系统时间
 *   2. Wi-Fi 状态 (netsh 原始输出 + 解析摘要: BSSID/信号/速率/通道)
 *   3. IP 配置 (ipconfig /all 或等效命令)
 *   4. 默认网关
 *   5. DNS 服务器列表
 *   6. 路由表 (活跃路由, 截断到 30 行)
 *   7. ARP 缓存表
 *   8. 当前 Ping 统计汇总
 *   9. 最近 HTTP 状态
 *  10. 下载测速状态
 *
 * 冷却机制: 使用 snapshotCooldown (默认 30s) 防止快照刷屏,
 * 同一原因导致的连续异常不会重复捕获。
 */

import { getPlatformAdapter } from '../platform/index.js';
import { getPingStats } from '../core/ping.js';
import { getHttpStats } from '../core/http.js';
import { getDownloadStats } from '../core/download.js';
import { getWifiStats } from './wifi.js';
import type { NetworkSnapshot } from '../types.js';

/** 内存中的异常快照列表 */
let snapshots: NetworkSnapshot[] = [];

/** 最大保留快照数 */
const MAX_SNAPSHOTS = 100;

/** 上次捕获时间戳 (用于冷却判断, 毫秒) */
let lastCaptureTime = 0;

/**
 * 从路由表输出中提取活跃路由部分 (截断到 30 行)
 *
 * Windows route print 输出较长, 只保留活动路由部分。
 * Linux/macOS 的 ip route / netstat -rn 输出通常已较精简。
 */
function extractActiveRoutes(routeOutput: string): string {
  const lines = routeOutput.split('\n');
  const keptLines: string[] = [];
  let inActiveSection = false;

  for (const line of lines) {
    // Windows: 检测 "活动路由" / "Active Routes" 节
    if (line.includes('活动路由') || line.includes('Active Routes')) {
      inActiveSection = true;
    }
    if (inActiveSection || !routeOutput.includes('Active Routes')) {
      keptLines.push(line);
    }
    if (keptLines.length > 30) {
      keptLines.push('  ... (更多路由省略)');
      break;
    }
  }

  // 如果未检测到活跃路由标记, 返回前 2000 字符
  if (keptLines.length === 0) {
    return routeOutput.slice(0, 2000);
  }
  return keptLines.join('\n');
}

/**
 * 生成 Wi-Fi 摘要字符串
 *
 * 将解析后的关键字段拼接为一行摘要, 便于快速查看。
 */
function buildWifiSummary(wifi: ReturnType<typeof getWifiStats>['current']): string {
  if (!wifi) return '';
  return (
    `BSSID:${wifi.bssid}  信号:${wifi.signal}  ` +
    `通道:${wifi.channel}  Rx:${wifi.rxRate}  Tx:${wifi.txRate}`
  );
}

// ============================================================
// 公共 API
// ============================================================

/**
 * 捕获一次异常快照
 *
 * @param reason 触发原因 (如 "全面超时" / "AP漫游" / "HTTP 失败")
 * @param cooldownSec 冷却时间 (秒), 默认 30s
 * @returns 快照对象, 冷却中时返回 null
 */
export async function captureSnapshot(
  reason: string,
  cooldownSec = 30
): Promise<NetworkSnapshot | null> {
  const now = Date.now();

  // 冷却检查
  if (now - lastCaptureTime < cooldownSec * 1000) {
    return null;
  }
  lastCaptureTime = now;

  const timestamp = new Date().toISOString();
  const systemTime = new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  console.log(`[snapshot] 📸 异常快照捕获中... 原因: ${reason}`);

  const adapter = getPlatformAdapter();

  // 并行采集所有系统信息
  const [ipConfig, routeTableRaw, arpTable, wifiInfo] = await Promise.all([
    adapter.getIpConfig().catch(() => null),
    adapter.getRouteTable().catch(() => '[route获取失败]'),
    adapter.getArpTable().catch(() => '[arp获取失败]'),
    adapter.getWifiInfo().catch(() => null),
  ]);

  // Wi-Fi 快照
  let wifiSnapshot: NetworkSnapshot['wifi'] = null;
  if (wifiInfo) {
    wifiSnapshot = {
      raw: wifiInfo.raw,
      summary: buildWifiSummary(wifiInfo),
    };
  }

  // 路由表 (截断)
  const routeTable = extractActiveRoutes(routeTableRaw);

  // Ping 统计汇总
  const pingStats = getPingStats();
  const pingSummary = pingStats.map((s) => ({
    target: s.target,
    host: s.host,
    sent: s.total,
    lost: s.lost,
    lossRate: s.total > 0 ? Math.round((s.lost / s.total) * 10000) / 100 : 0,
  }));

  // HTTP 统计汇总
  const httpStats = getHttpStats();
  const httpSummary = {
    total: httpStats.total,
    fail: httpStats.fail,
    slow: httpStats.slow,
    recentTimes: httpStats.times.slice(-5),
  };

  // 下载测速统计汇总
  const dlStats = getDownloadStats();
  const downloadSummary = {
    total: dlStats.total,
    fail: dlStats.fail,
    stall: dlStats.stall,
    slow: dlStats.slow,
    recentSpeeds: dlStats.speeds.slice(-5),
    recentTtfbs: dlStats.ttfbs.slice(-5),
  };

  const snapshot: NetworkSnapshot = {
    timestamp,
    reason,
    systemTime,
    wifi: wifiSnapshot,
    ipConfig,
    routeTable,
    arpTable,
    pingSummary,
    httpSummary,
    downloadSummary,
  };

  // 存入内存
  snapshots.push(snapshot);
  if (snapshots.length > MAX_SNAPSHOTS) {
    snapshots = snapshots.slice(-Math.floor(MAX_SNAPSHOTS / 2));
  }

  console.log(`[snapshot] 快照已保存 (原因: ${reason})`);
  return snapshot;
}

/** 获取所有异常快照 */
export function getSnapshots(): NetworkSnapshot[] {
  return [...snapshots];
}

/** 获取最近一次异常快照 */
export function getLastSnapshot(): NetworkSnapshot | null {
  return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
}

/** 重置异常快照列表 */
export function resetSnapshots(): void {
  snapshots = [];
  lastCaptureTime = 0;
}
