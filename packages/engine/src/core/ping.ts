/**
 * 核心 Ping 探测模块
 *
 * 平台无关的 ping 实现 —— 委托给 PlatformAdapter。
 * 负责:多目标轮询、统计汇总、异常检测。
 */

import { getPlatformAdapter } from '../platform/index.js';
import type { PingResult, PingTarget, PingStats, MonitorConfig } from '../types.js';
import { MAX_LATENCY_HISTORY } from '../config.js';

/** 内存中的每个目标的统计数据 */
const statsMap = new Map<string, PingStats>();

/**
 * 执行单次 Ping 探测 (单个目标)
 */
export async function pingOnce(
  target: PingTarget,
  timeoutMs = 2000
): Promise<PingResult> {
  const adapter = getPlatformAdapter();
  return adapter.ping(target.host, timeoutMs, target.name);
}

/**
 * 对配置中的所有目标执行一轮 Ping
 */
export async function pingAll(
  config: MonitorConfig
): Promise<PingResult[]> {
  const results = await Promise.all(
    config.pingTargets.map((t) => pingOnce(t))
  );
  // 更新统计
  for (const r of results) {
    updateStats(r, config);
  }
  return results;
}

/** 将单次结果写入统计 */
function updateStats(result: PingResult, config: MonitorConfig): void {
  let stats = statsMap.get(result.host);
  if (!stats) {
    stats = {
      target: result.target,
      host: result.host,
      total: 0,
      lost: 0,
      latencies: [],
      spikes: 0,
    };
    statsMap.set(result.host, stats);
  }

  stats.total += 1;

  if (!result.ok) {
    stats.lost += 1;
    return;
  }

  if (result.latencyMs !== null) {
    stats.latencies.push(result.latencyMs);
    // 内存保护:超过上限时裁剪前一半
    if (stats.latencies.length > config.maxLatencyHistory) {
      stats.latencies = stats.latencies.slice(-Math.floor(config.maxLatencyHistory / 2));
    }
    // 高延迟检测
    if (result.latencyMs >= config.spikeThresholdMs) {
      stats.spikes += 1;
    }
  }
}

/**
 * 获取指定目标的统计,或所有目标的统计列表
 */
export function getPingStats(): PingStats[] {
  return Array.from(statsMap.values());
}

/** 重置统计 (停止监控时调用) */
export function resetPingStats(): void {
  statsMap.clear();
}

/**
 * 检测异常事件
 * 返回需要推送的异常信息,无异常时返回 null
 */
export function detectPingAnomaly(
  result: PingResult,
  config: MonitorConfig
): { type: string; message: string } | null {
  if (!result.ok) {
    return {
      type: '丢包',
      message: `[${result.target}] ${result.host} 超时/无响应`,
    };
  }
  if (result.latencyMs !== null && result.latencyMs >= config.spikeThresholdMs) {
    return {
      type: '高延迟',
      message: `[${result.target}] ${result.latencyMs}ms >= ${config.spikeThresholdMs}ms`,
    };
  }
  return null;
}
