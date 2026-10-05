/**
 * 监控主循环管理器
 *
 * 负责:
 *   - 启动/停止各采集任务 (ping/http/dns/wifi/adapter)
 *   - 管理定时器间隔
 *   - 维护引擎状态机 (idle → running → stopping → idle)
 *   - 收集异常事件
 *   - 生成阶段汇总报告
 *   - 向 SSE 订阅者推送事件
 */

import type {
  MonitorConfig,
  EngineStatus,
  EngineState,
  MonitorEvent,
  AnomalyEvent,
  SummaryReport,
  PingStats,
  HttpStats,
  DnsStats,
  WifiStats,
  DownloadStats,
  DiagnosisResult,
  NetworkSnapshot,
  TimelineEvent,
  TimelineTargetDetail,
  BusinessImpactRecord,
} from './types.js';
import { getDefaultConfig } from './config.js';
import { pingAll, getPingStats, resetPingStats, detectPingAnomaly } from './core/ping.js';
import { httpAll, getHttpStats, resetHttpStats, detectHttpAnomaly } from './core/http.js';
import { dnsAll, getDnsStats, resetDnsStats, detectDnsAnomaly } from './core/dns.js';
import { downloadOnce, getDownloadStats, resetDownloadStats, detectDownloadAnomaly } from './core/download.js';
import { runDiagnosis, getDiagnosisHistory, resetDiagnosisHistory } from './core/traceroute.js';
import { collectWifi, getWifiStats, resetWifiStats } from './collector/wifi.js';
import { collectAdapter, resetAdapterStats } from './collector/adapter.js';
import { captureSnapshot, getSnapshots, resetSnapshots } from './collector/snapshot.js';
import { recordTimelineEvent, classifyPingAnomaly, getTimeline, resetTimeline } from './core/timeline.js';
import { recordBusinessImpact, getImpactRecords, resetImpactRecords } from './core/impact.js';
import { getPlatformAdapter } from './platform/index.js';
import { logger } from './logger/index.js';
import { resolveGatewayTargets } from './core/gateway.js';

/** SSE 事件监听器类型 */
type EventListener = (event: MonitorEvent) => void;

/** 当前引擎状态 */
let status: EngineStatus = 'idle';
let startedAt: string | null = null;
let config: MonitorConfig = getDefaultConfig();

/** 定时器引用 (用于 stop 时清理) */
let pingTimer: ReturnType<typeof setInterval> | null = null;
let httpTimer: ReturnType<typeof setInterval> | null = null;
let dnsTimer: ReturnType<typeof setInterval> | null = null;
let downloadTimer: ReturnType<typeof setInterval> | null = null;
let wifiTimer: ReturnType<typeof setInterval> | null = null;
let summaryTimer: ReturnType<typeof setInterval> | null = null;

/** 异常事件列表 */
let anomalies: AnomalyEvent[] = [];

/** 连续全超时轮次计数器 */
let consecutiveAllFailRounds = 0;

/** 上次 tracert 时间戳 (用于冷却) */
let lastTraceTime = 0;

/** 网络中断/恢复状态机 */
let isInOutage = false;
let outageStartTimeMs = 0;

/** SSE 订阅者列表 */
const listeners: Set<EventListener> = new Set();

/** 向所有 SSE 订阅者推送事件 */
function emit(type: MonitorEvent['type'], data: unknown): void {
  const event: MonitorEvent = {
    type,
    data,
    timestamp: new Date().toISOString(),
  };
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // 忽略单个监听器的错误
    }
  }
}

/** 推送异常事件 */
function pushAnomaly(type: string, message: string): void {
  const anomaly: AnomalyEvent = {
    type,
    message,
    timestamp: new Date().toISOString(),
  };
  anomalies.push(anomaly);
  emit('anomaly', anomaly);

  // 写入异常日志 (spike)
  const now = new Date().toLocaleString('zh-CN', { hour12: false });
  logger.append('spike', `[${now}] ${message}`);
}

/**
 * 触发异常快照 (带冷却机制)
 *
 * 在检测到网络异常时调用, 捕获全量网络状态作为「现场保全」证据。
 * 冷却期间内不会重复捕获。
 */
async function triggerSnapshot(reason: string): Promise<void> {
  try {
    const snapshot = await captureSnapshot(reason, config.snapshotCooldown);
    if (snapshot) {
      emit('snapshot', snapshot);
    }
  } catch (e) {
    console.error('[engine] 快照采集异常:', e);
  }
}

/**
 * 执行一轮 Ping 探测
 *
 * 同时检测是否所有目标均超时 (连续全失败),
 * 达到阈值时自动触发路由追踪诊断。
 * 还负责: 异常时间轴记录 + 网络中断/恢复状态机。
 */
async function runPing(): Promise<void> {
  try {
    const results = await pingAll(config);
    let allFailed = true;
    let failCount = 0;
    let hasSpike = false;
    const roundDetails: Record<string, TimelineTargetDetail> = {};

    for (const r of results) {
      emit('ping', r);
      const anomaly = detectPingAnomaly(r, config);
      if (anomaly) {
        pushAnomaly(anomaly.type, anomaly.message);
        // 丢包或高延迟时触发异常快照
        triggerSnapshot(`${anomaly.type}: ${anomaly.message}`);
        // 保存原始 Ping 输出作为证据
        logger.append('rawping', `\n[${r.timestamp}] PING ${r.target} (${r.host})\n${'-'.repeat(50)}\n${r.rawOutput}\n${'-'.repeat(50)}`);
      }

      // 写入主日志
      const latStr = r.latencyMs !== null ? r.latencyMs.toFixed(1) : '-';
      logger.append('ping', `[${r.timestamp}] PING ${r.target} ${r.host} ${r.ok ? 'OK' : 'FAIL'} ${latStr}ms`);

      if (r.ok) {
        allFailed = false;
        // 构建时间轴详情
        if (r.latencyMs !== null && r.latencyMs >= config.spikeThresholdMs) {
          hasSpike = true;
          roundDetails[r.target] = {
            status: '高延迟',
            extra: `${r.latencyMs.toFixed(1)}ms (阈值${config.spikeThresholdMs}ms)`,
          };
        } else {
          roundDetails[r.target] = {
            status: `正常 (${r.latencyMs !== null ? r.latencyMs.toFixed(1) : '?'}ms)`,
            extra: '',
          };
        }
      } else {
        failCount += 1;
        roundDetails[r.target] = { status: '超时/丢包', extra: '' };
      }
    }

    // --- 异常时间轴记录 ---
    const totalTargets = results.length;
    const classification = classifyPingAnomaly(failCount, totalTargets, hasSpike);
    if (classification) {
      const timelineEvent = recordTimelineEvent(
        classification.eventType,
        classification.severity,
        roundDetails,
        config.pingInterval
      );
      emit('timeline', timelineEvent);

      // 写入时间轴日志
      const tlLines: string[] = [];
      tlLines.push(`\n${'='.repeat(55)}`);
      tlLines.push(`  [${timelineEvent.dateStr} ${timelineEvent.timeStr}]  ${timelineEvent.eventType}`);
      tlLines.push(`${'='.repeat(55)}`);
      for (const [name, detail] of Object.entries(roundDetails)) {
        tlLines.push(`  ${name}：${detail.status}  ${detail.extra}`);
      }
      if (timelineEvent.durationHint) {
        tlLines.push(`  持续约 ${timelineEvent.durationHint}`);
      }
      logger.append('timeline', tlLines.join('\n'));
    }

    // --- 网络中断/恢复状态机 ---
    if (!isInOutage && allFailed && totalTargets > 0) {
      // 进入中断状态
      isInOutage = true;
      outageStartTimeMs = Date.now();
    } else if (isInOutage && failCount === 0) {
      // 网络恢复
      isInOutage = false;
      const outageDurationSec = Math.round((Date.now() - outageStartTimeMs) / 1000);
      const recoveryDetails: Record<string, TimelineTargetDetail> = {};
      for (const r of results) {
        recoveryDetails[r.target] = {
          status: '已恢复',
          extra: r.latencyMs !== null ? `${r.latencyMs.toFixed(1)}ms` : '',
        };
      }
      const recoveryEvent = recordTimelineEvent(
        `网络恢复（中断约${outageDurationSec}秒）`,
        'info',
        recoveryDetails,
        config.pingInterval
      );
      emit('timeline', recoveryEvent);
      emit('recovery', { durationSec: outageDurationSec, timestamp: recoveryEvent.timestamp });
      pushAnomaly('网络恢复', `网络已恢复, 中断持续约 ${outageDurationSec} 秒`);
      console.log(`[engine] ✔ 网络已恢复! 中断持续约 ${outageDurationSec} 秒`);
    }

    // --- 连续全失败追踪 ---
    if (results.length > 0) {
      if (allFailed) {
        consecutiveAllFailRounds += 1;
        // 全面超时时也触发快照 (与冷却机制共用, 不会重复捕获)
        triggerSnapshot(`全面超时 (${results.length}/${results.length} 目标不可达)`);
        if (consecutiveAllFailRounds >= config.consecutiveFailForTracert) {
          await maybeRunTraceroute(
            `${consecutiveAllFailRounds}/${results.length} 目标连续超时`
          );
          consecutiveAllFailRounds = 0; // 重置计数器
        }
      } else {
        consecutiveAllFailRounds = 0;
      }
    }
  } catch (e) {
    console.error('[engine] ping 任务异常:', e);
  }
}

/**
 * 检查冷却时间, 满足条件时执行路由追踪诊断
 */
async function maybeRunTraceroute(reason: string): Promise<void> {
  const now = Date.now() / 1000;
  if (now - lastTraceTime < config.traceCooldown) {
    console.log(`[engine] tracert 冷却中, 跳过 (${Math.round(config.traceCooldown - (now - lastTraceTime))}s 后重试)`);
    return;
  }

  lastTraceTime = now;
  console.log(`[engine] ⚠ 触发自动诊断: ${reason}`);

  pushAnomaly('自动诊断', `触发路由追踪: ${reason}`);

  try {
    // 获取当前 Wi-Fi 状态用于诊断
    const wifiStats = getWifiStats();
    const wifiInfo = wifiStats.current ?? null;
    const result = await runDiagnosis(reason, wifiInfo);
    emit('traceroute', result);
    console.log(`[engine] 诊断完成: ${result.analysis.join(', ')}`);
  } catch (e) {
    console.error('[engine] 诊断任务异常:', e);
  }
}

/**
 * 执行一轮 HTTP 测试
 *
 * HTTP 失败或 >5s 时触发业务影响记录。
 */
async function runHttp(): Promise<void> {
  try {
    const results = await httpAll(config);
    for (const r of results) {
      emit('http', r);
      const anomaly = detectHttpAnomaly(r);
      if (anomaly) {
        pushAnomaly(anomaly.type, anomaly.message);
        // HTTP 失败或严重慢连接时触发快照
        if (!r.ok || r.timeMs > 10000) {
          triggerSnapshot(`HTTP ${r.name} ${!r.ok ? '失败' : `${r.timeMs.toFixed(0)}ms`}`);
        }
      }

      // 写入主日志
      logger.append('ping', `[${r.timestamp}] HTTP ${r.name} ${r.ok ? 'OK' : 'FAIL'} ${r.timeMs.toFixed(0)}ms`);

      // 业务影响记录: HTTP 失败或 >5s 时记录
      if (!r.ok || r.timeMs > 5000) {
        const impact = recordBusinessImpact(
          'HTTP',
          r.name,
          r.ok,
          r.timeMs,
          r.info
        );
        if (impact) {
          emit('impact', impact);
          console.log(`[engine] ★ 业务影响: ${impact.conclusion}`);
        }
      }
    }
  } catch (e) {
    console.error('[engine] http 任务异常:', e);
  }
}

/**
 * 执行一轮 DNS 测试
 */
async function runDns(): Promise<void> {
  try {
    const results = await dnsAll(config);
    for (const r of results) {
      emit('dns', r);
      const anomaly = detectDnsAnomaly(r);
      if (anomaly) pushAnomaly(anomaly.type, anomaly.message);

      // 写入主日志
      logger.append('ping', `[${r.timestamp}] DNS ${r.domain} ${r.ok ? 'OK' : 'FAIL'} ${r.timeMs.toFixed(0)}ms -> ${r.result}`);
    }
  } catch (e) {
    console.error('[engine] dns 任务异常:', e);
  }
}

/**
 * 执行一次下载测速
 *
 * 下载失败或严重停顿时触发业务影响记录。
 */
async function runDownload(): Promise<void> {
  try {
    const result = await downloadOnce();
    emit('download', result);
    const anomaly = detectDownloadAnomaly(result);
    if (anomaly) {
      pushAnomaly(anomaly.type, anomaly.message);
      // 严重停顿 (>5s) 时触发快照
      if (result.ok && result.maxStallMs > 5000) {
        triggerSnapshot(`下载停顿 ${result.maxStallMs.toFixed(0)}ms`);
      }
    }

    // 写入下载测速日志
    if (result.ok) {
      logger.append('download',
        `[${result.timestamp}] OK  TTFB:${result.ttfbMs.toFixed(0)}ms  ` +
        `速度:${result.speedMbps.toFixed(2)}MB/s  ` +
        `大小:${Math.floor(result.totalBytes / 1024)}KB  ` +
        `耗时:${result.durationMs.toFixed(0)}ms  ` +
        `停顿:${result.stalls}次  ` +
        `最长停顿:${result.maxStallMs.toFixed(0)}ms  ` +
        `停顿占比:${result.stallRatio.toFixed(1)}%`
      );
    } else {
      logger.append('download', `[${result.timestamp}] FAIL  错误:${result.error}`);
    }

    // 业务影响记录: 下载失败或严重停顿时记录
    if (!result.ok || result.maxStallMs > 5000) {
      const infoStr = result.ok
        ? `速度${result.speedMbps.toFixed(2)}MB/s 停顿${result.stalls}次`
        : (result.error ?? '未知错误');
      const impact = recordBusinessImpact(
        '下载测速',
        '下载测速',
        result.ok,
        result.durationMs,
        infoStr
      );
      if (impact) {
        emit('impact', impact);
        console.log(`[engine] ★ 业务影响: ${impact.conclusion}`);
      }
    }
  } catch (e) {
    console.error('[engine] download 任务异常:', e);
  }
}

/**
 * 执行一次 Wi-Fi 采集
 */
async function runWifi(): Promise<void> {
  try {
    const info = await collectWifi();
    if (info) {
      emit('wifi', info);

      // 写入 Wi-Fi CSV 日志
      const now = new Date().toLocaleString('zh-CN', { hour12: false });
      logger.append('wifi',
        `${now},${info.bssid},${info.signal},${info.rxRate},${info.txRate},` +
        `${info.channel},${info.rssi},${info.band}`
      );
      logger.append('ping',
        `[${now}] WIFI BSSID:${info.bssid} 信号:${info.signal} ` +
        `Rx:${info.rxRate} Tx:${info.txRate} Ch:${info.channel} RSSI:${info.rssi}`
      );

      // AP 漫游时触发快照 (漫游可能导致瞬间断流)
      // collectWifi() 内部已更新 history, 通过比较采集前后的漫游次数判断是否刚发生漫游
      const wifiStats = getWifiStats();
      if (wifiStats.history.length > 0) {
        const lastEvent = wifiStats.history[wifiStats.history.length - 1];
        // 检查最近一次漫游事件是否在 5 秒内 (刚刚发生)
        const eventTime = new Date(lastEvent.time).getTime();
        if (Date.now() - eventTime < 5000) {
          triggerSnapshot(`AP漫游 ${lastEvent.from}→${lastEvent.to}`);
        }
      }
    }
  } catch (e) {
    console.error('[engine] wifi 任务异常:', e);
  }
}

/**
 * 启动网络自检
 *
 * 对齐原版 check_network_available(): 启动时检查网关可达性,
 * 结果写入日志与控制台; 不可达时推送异常事件提醒, 监控仍继续探测。
 */
async function runStartupCheck(): Promise<void> {
  const gateway = config.pingTargets[0];
  if (!gateway) return;
  try {
    const adapter = getPlatformAdapter();
    const result = await adapter.ping(gateway.host, 3000, gateway.name);
    if (result.ok) {
      const msg = `启动自检: ${gateway.name} (${gateway.host}) 可达, 延迟 ${result.latencyMs ?? '?'}ms`;
      console.log(`[engine] ✔ ${msg}`);
      logger.append('ping', `[${result.timestamp}] ${msg}`);
    } else {
      const msg = `启动自检: ${gateway.name} (${gateway.host}) 不可达, 网络可能已中断, 监控继续探测`;
      console.warn(`[engine] ⚠ ${msg}`);
      logger.append('ping', `[${result.timestamp}] ${msg}`);
      pushAnomaly('启动自检', msg);
    }
  } catch (e) {
    console.error('[engine] 启动自检异常:', e);
  }
}

/**
 * 生成并输出最终报告
 *
 * 对齐原版 Ctrl+C 退出时的完整统计: 汇总各维度探测结果、
 * 异常/诊断/快照数量, 并列出日志文件清单, 作为本次监控的收尾凭证。
 * 必须在统计数据重置前调用。
 */
function writeFinalReport(): void {
  const report = generateSummary();
  const lines: string[] = [];
  lines.push('='.repeat(60));
  lines.push('  最终监控报告');
  lines.push('='.repeat(60));
  lines.push(`  监控时长: ${formatDuration(report.uptimeSeconds)}  |  开始于: ${startedAt ?? '-'}`);
  lines.push(`  异常事件: ${report.anomalies} 次 | 自动诊断: ${report.traces} 次 | 异常快照: ${getSnapshots().length} 次 | 时间轴事件: ${getTimeline().length} 条`);
  lines.push('  --- Ping ---');
  for (const p of report.ping) {
    lines.push(`    ${p.target} (${p.host}): ${p.total}次 丢包${p.lossRate}% 均值${p.avg ?? '-'}ms P95=${p.p95 ?? '-'}ms P99=${p.p99 ?? '-'}ms`);
  }
  lines.push(`  --- HTTP ---  ${report.http.total}次 失败${report.http.fail} 慢连接${report.http.slow} 均值${report.http.avg ?? '-'}ms`);
  lines.push(`  --- DNS ---   ${report.dns.total}次 失败${report.dns.fail} 慢解析${report.dns.slow} 均值${report.dns.avg ?? '-'}ms`);
  lines.push(`  --- 下载 ---  ${report.download.total}次 失败${report.download.fail} 停顿${report.download.stall} 均速${report.download.avgSpeed ?? '-'}MB/s`);
  lines.push(`  --- Wi-Fi --- AP漫游 ${report.wifi.roaming} 次`);
  lines.push('  日志文件清单:');
  for (const fp of Object.values(logger.getAllFilePaths())) {
    lines.push(`    ${fp}`);
  }
  lines.push('='.repeat(60));
  const text = lines.join('\n');
  console.log('\n' + text);
  logger.append('ping', '\n' + text);
}

/** 格式化时长 (秒 → 可读文本) */
function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}小时${m}分${s}秒`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

/**
 * 生成阶段汇总报告
 */
function generateSummary(): SummaryReport {
  const pingStats = getPingStats();
  const httpStats = getHttpStats();
  const dnsStats = getDnsStats();
  const wifiStats = getWifiStats();
  const downloadStats = getDownloadStats();

  const uptimeSeconds = startedAt
    ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
    : 0;

  return {
    timestamp: new Date().toISOString(),
    ping: pingStats.map((s) => computePingSummary(s)),
    http: {
      total: httpStats.total,
      fail: httpStats.fail,
      slow: httpStats.slow,
      avg: average(httpStats.times),
    },
    dns: {
      total: dnsStats.total,
      fail: dnsStats.fail,
      slow: dnsStats.slow,
      avg: average(dnsStats.times),
    },
    download: {
      total: downloadStats.total,
      fail: downloadStats.fail,
      stall: downloadStats.stall,
      slow: downloadStats.slow,
      avgSpeed: average(downloadStats.speeds),
      avgTtfb: average(downloadStats.ttfbs),
    },
    wifi: {
      roaming: wifiStats.roaming,
    },
    traces: getDiagnosisHistory().length,
    anomalies: anomalies.length,
    uptimeSeconds,
  };
}

/** 计算单个 Ping 目标的汇总统计 */
function computePingSummary(stats: PingStats): SummaryReport['ping'][0] {
  const sorted = [...stats.latencies].sort((a, b) => a - b);
  return {
    target: stats.target,
    host: stats.host,
    total: stats.total,
    lost: stats.lost,
    lossRate: stats.total > 0 ? Math.round((stats.lost / stats.total) * 10000) / 100 : 0,
    spikes: stats.spikes,
    min: sorted.length > 0 ? sorted[0] : null,
    max: sorted.length > 0 ? sorted[sorted.length - 1] : null,
    avg: average(sorted),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    jitter: jitter(sorted),
  };
}

/** 计算平均值 */
function average(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100;
}

/** 计算百分位数 */
function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/** 计算抖动 (相邻差值的平均) */
function jitter(sorted: number[]): number | null {
  if (sorted.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < sorted.length; i++) {
    sum += Math.abs(sorted[i] - sorted[i - 1]);
  }
  return Math.round((sum / (sorted.length - 1)) * 100) / 100;
}

/**
 * 生成汇总并推送
 */
function runSummary(): void {
  const report = generateSummary();
  emit('summary', report);
}

// ============================================================
// 公共 API
// ============================================================

/**
 * 启动监控
 *
 * @param customConfig 可选自定义配置,会与默认配置合并
 */
export async function startMonitor(customConfig?: Partial<MonitorConfig>): Promise<void> {
  if (status === 'running') {
    console.log('[engine] 已在运行中');
    return;
  }

  // 合并配置
  config = { ...getDefaultConfig(), ...customConfig };

  // 网关自动发现: 将占位符目标解析为真实网关 IP (在家/校园网均可用)
  config.pingTargets = await resolveGatewayTargets(config.pingTargets);
  anomalies = [];
  consecutiveAllFailRounds = 0;
  lastTraceTime = 0;
  startedAt = new Date().toISOString();
  status = 'running';

  console.log('[engine] 启动监控');
  emit('status', { status: 'running', startedAt });

  // 初始化日志系统
  logger.init();

  // 启动网络自检 (异步, 不阻塞首轮探测)
  runStartupCheck();

  // 立即执行一轮
  runPing();
  runHttp();
  runDns();
  runDownload();
  runWifi();

  // 设置定时器
  pingTimer = setInterval(runPing, config.pingInterval * 1000);
  httpTimer = setInterval(runHttp, config.httpInterval * 1000);
  dnsTimer = setInterval(runDns, config.dnsInterval * 1000);
  downloadTimer = setInterval(runDownload, config.downloadInterval * 1000);
  wifiTimer = setInterval(runWifi, config.wifiInterval * 1000);
  summaryTimer = setInterval(runSummary, config.summaryInterval * 1000);
}

/**
 * 停止监控
 */
export function stopMonitor(): void {
  if (status !== 'running') {
    console.log('[engine] 未在运行');
    return;
  }

  status = 'stopping';
  console.log('[engine] 停止监控');

  // 清理所有定时器
  if (pingTimer) clearInterval(pingTimer);
  if (httpTimer) clearInterval(httpTimer);
  if (dnsTimer) clearInterval(dnsTimer);
  if (downloadTimer) clearInterval(downloadTimer);
  if (wifiTimer) clearInterval(wifiTimer);
  if (summaryTimer) clearInterval(summaryTimer);

  pingTimer = httpTimer = dnsTimer = downloadTimer = wifiTimer = summaryTimer = null;

  // 生成最终汇总
  runSummary();

  // 输出最终报告 (必须在统计数据重置前)
  writeFinalReport();

  // 重置统计数据
  resetPingStats();
  resetHttpStats();
  resetDnsStats();
  resetDownloadStats();
  resetWifiStats();
  resetAdapterStats();
  resetDiagnosisHistory();
  resetSnapshots();
  resetTimeline();
  resetImpactRecords();

  // 重置中断状态机
  isInOutage = false;
  outageStartTimeMs = 0;

  // 关闭日志系统
  logger.closeAll();

  status = 'idle';
  startedAt = null;
  emit('status', { status: 'idle' });
}

/**
 * 获取当前引擎状态
 */
export function getState(): EngineState {
  const uptimeSeconds = startedAt
    ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
    : 0;

  return {
    status,
    startedAt,
    uptimeSeconds,
    config: { ...config },
  };
}

/**
 * 获取 Ping 统计
 */
export function getPingStatistics(): PingStats[] {
  return getPingStats();
}

/**
 * 获取 HTTP 统计
 */
export function getHttpStatistics(): HttpStats {
  return getHttpStats();
}

/**
 * 获取 DNS 统计
 */
export function getDnsStatistics(): DnsStats {
  return getDnsStats();
}

/**
 * 获取下载测速统计
 */
export function getDownloadStatistics(): DownloadStats {
  return getDownloadStats();
}

/**
 * 获取 Wi-Fi 统计
 */
export function getWifiStatistics(): WifiStats {
  return getWifiStats();
}

/**
 * 获取异常事件列表
 */
export function getAnomalies(): AnomalyEvent[] {
  return [...anomalies];
}

/**
 * 获取诊断历史
 */
export function getDiagnosisRecords(): DiagnosisResult[] {
  return getDiagnosisHistory();
}

/**
 * 获取异常快照列表
 */
export function getSnapshotRecords(): NetworkSnapshot[] {
  return getSnapshots();
}

/**
 * 获取时间轴事件列表
 */
export function getTimelineRecords(): TimelineEvent[] {
  return getTimeline();
}

/**
 * 获取业务影响记录列表
 */
export function getImpactRecordsList(): BusinessImpactRecord[] {
  return getImpactRecords();
}

/**
 * 订阅 SSE 事件
 *
 * @returns 取消订阅函数
 */
export function subscribe(listener: EventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
