/**
 * CSV 数据导出模块
 *
 * 将引擎当前统计数据导出为 CSV 格式,
 * 支持 Excel / Google Sheets 直接打开。
 */

import { getPingStats } from '../core/ping.js';
import { getHttpStats } from '../core/http.js';
import { getDnsStats } from '../core/dns.js';
import { getDownloadStats } from '../core/download.js';
import { getDiagnosisHistory } from '../core/traceroute.js';
import { getWifiStats } from '../collector/wifi.js';
import { getAnomalies } from '../engine.js';

/**
 * 导出所有统计数据为 CSV 字符串
 */
export function exportCsv(): string {
  const sections: string[] = [];

  // --- Ping 统计 ---
  const pingStats = getPingStats();
  if (pingStats.length > 0) {
    const header = '目标,IP,总次数,丢失,丢失率%,高延迟次数,最小ms,最大ms,平均ms';
    const rows = pingStats.map((s) => {
      const sorted = [...s.latencies].sort((a, b) => a - b);
      const min = sorted.length > 0 ? sorted[0].toFixed(2) : '';
      const max = sorted.length > 0 ? sorted[sorted.length - 1].toFixed(2) : '';
      const avg = sorted.length > 0
        ? (sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(2)
        : '';
      const lossRate = s.total > 0 ? ((s.lost / s.total) * 100).toFixed(2) : '0';
      return `${csvEscape(s.target)},${s.host},${s.total},${s.lost},${lossRate},${s.spikes},${min},${max},${avg}`;
    });
    sections.push(`# Ping 统计\n${header}\n${rows.join('\n')}`);
  }

  // --- HTTP 统计 ---
  const httpStats = getHttpStats();
  if (httpStats.total > 0) {
    const avg = httpStats.times.length > 0
      ? (httpStats.times.reduce((a, b) => a + b, 0) / httpStats.times.length).toFixed(2)
      : '';
    sections.push(
      `# HTTP 统计\n总次数,失败,慢连接(>1s),平均ms\n${httpStats.total},${httpStats.fail},${httpStats.slow},${avg}`
    );
  }

  // --- DNS 统计 ---
  const dnsStats = getDnsStats();
  if (dnsStats.total > 0) {
    const avg = dnsStats.times.length > 0
      ? (dnsStats.times.reduce((a, b) => a + b, 0) / dnsStats.times.length).toFixed(2)
      : '';
    sections.push(
      `# DNS 统计\n总次数,失败,慢解析(>200ms),平均ms\n${dnsStats.total},${dnsStats.fail},${dnsStats.slow},${avg}`
    );
  }

  // --- 下载测速统计 ---
  const downloadStats = getDownloadStats();
  if (downloadStats.total > 0) {
    const avgSpeed = downloadStats.speeds.length > 0
      ? (downloadStats.speeds.reduce((a, b) => a + b, 0) / downloadStats.speeds.length).toFixed(2)
      : '';
    const avgTtfb = downloadStats.ttfbs.length > 0
      ? (downloadStats.ttfbs.reduce((a, b) => a + b, 0) / downloadStats.ttfbs.length).toFixed(0)
      : '';
    const avgStallCount = downloadStats.stallCounts.length > 0
      ? (downloadStats.stallCounts.reduce((a, b) => a + b, 0) / downloadStats.stallCounts.length).toFixed(1)
      : '';
    sections.push(
      `# 下载测速统计\n总次数,失败,停顿次数,慢下载,平均速度(MB/s),平均TTFB(ms),平均停顿次数\n${downloadStats.total},${downloadStats.fail},${downloadStats.stall},${downloadStats.slow},${avgSpeed},${avgTtfb},${avgStallCount}`
    );
  }

  // --- Wi-Fi 统计 ---
  const wifiStats = getWifiStats();
  if (wifiStats.roaming > 0 || wifiStats.current) {
    const rows = [`漫游次数,${wifiStats.roaming}`];
    if (wifiStats.current) {
      rows.push(`SSID,${csvEscape(wifiStats.current.ssid)}`);
      rows.push(`BSSID,${wifiStats.current.bssid}`);
      rows.push(`信号,${wifiStats.current.signal}`);
      rows.push(`波段,${wifiStats.current.band}`);
    }
    if (wifiStats.history.length > 0) {
      rows.push('');
      rows.push('漫游历史');
      rows.push('时间,从BSSID,到BSSID,信号');
      for (const e of wifiStats.history) {
        rows.push(`${e.time},${e.from},${e.to},${e.signal}`);
      }
    }
    sections.push(`# Wi-Fi 统计\n${rows.join('\n')}`);
  }

  // --- 异常事件 ---
  const anomalies = getAnomalies();
  if (anomalies.length > 0) {
    const header = '时间,类型,消息';
    const rows = anomalies.map((a) => `${a.timestamp},${csvEscape(a.type)},${csvEscape(a.message)}`);
    sections.push(`# 异常事件\n${header}\n${rows.join('\n')}`);
  }

  // --- 路由追踪记录 ---
  const diagnoses = getDiagnosisHistory();
  if (diagnoses.length > 0) {
    const rows: string[] = [];
    for (const d of diagnoses) {
      rows.push(`[${d.timestamp}] ${csvEscape(d.reason)}`);
      for (const t of d.traces) {
        rows.push(`  ${t.name}(${t.host}): ${t.hops.length}跳${t.hasTimeout ? ', 有超时' : ''}`);
      }
      for (const a of d.analysis) {
        rows.push(`  → ${csvEscape(a)}`);
      }
    }
    sections.push(`# 路由追踪诊断\n${rows.join('\n')}`);
  }

  // 添加 BOM (Excel 兼容 UTF-8)
  const content = sections.join('\n\n');
  return '\uFEFF' + content + '\n';
}

/** CSV 字段转义: 含逗号/引号/换行的字段需要双引号包裹 */
function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
