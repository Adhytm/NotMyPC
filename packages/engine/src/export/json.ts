/**
 * JSON 数据导出模块
 *
 * 将引擎当前统计数据导出为 JSON 格式,
 * 适合程序化消费和存档。
 */

import { getPingStats } from '../core/ping.js';
import { getHttpStats } from '../core/http.js';
import { getDnsStats } from '../core/dns.js';
import { getDownloadStats } from '../core/download.js';
import { getDiagnosisHistory } from '../core/traceroute.js';
import { getWifiStats } from '../collector/wifi.js';
import { getAnomalies, getState } from '../engine.js';

/**
 * 导出所有统计数据为 JSON 对象
 */
export function exportJson(): Record<string, unknown> {
  const state = getState();
  const pingStats = getPingStats();
  const httpStats = getHttpStats();
  const dnsStats = getDnsStats();
  const downloadStats = getDownloadStats();
  const wifiStats = getWifiStats();
  const anomalies = getAnomalies();

  return {
    exportedAt: new Date().toISOString(),
    engine: {
      status: state.status,
      startedAt: state.startedAt,
      uptimeSeconds: state.uptimeSeconds,
    },
    ping: pingStats.map((s) => ({
      target: s.target,
      host: s.host,
      total: s.total,
      lost: s.lost,
      lossRate: s.total > 0 ? Math.round((s.lost / s.total) * 10000) / 100 : 0,
      spikes: s.spikes,
      latencies: s.latencies,
    })),
    http: {
      total: httpStats.total,
      fail: httpStats.fail,
      slow: httpStats.slow,
      times: httpStats.times,
    },
    dns: {
      total: dnsStats.total,
      fail: dnsStats.fail,
      slow: dnsStats.slow,
      times: dnsStats.times,
    },
    download: {
      total: downloadStats.total,
      fail: downloadStats.fail,
      stall: downloadStats.stall,
      slow: downloadStats.slow,
      ttfbs: downloadStats.ttfbs,
      speeds: downloadStats.speeds,
      stallCounts: downloadStats.stallCounts,
      stallRatios: downloadStats.stallRatios,
    },
    wifi: {
      roaming: wifiStats.roaming,
      current: wifiStats.current,
      history: wifiStats.history,
    },
    anomalies,
    traceroute: getDiagnosisHistory(),
  };
}
