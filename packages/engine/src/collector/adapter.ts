/**
 * 网卡收发统计采集器
 *
 * 通过 PlatformAdapter 获取网卡真实收发统计 (内核级计数器)。
 * 用于监控网络流量趋势和异常 (如突发大量丢包)。
 */

import { getPlatformAdapter } from '../platform/index.js';
import type { AdapterStats } from '../types.js';

/** 上一次采集的快照 (用于计算增量) */
let lastSnapshot: AdapterStats | null = null;

/** 累计增量统计 */
let delta: AdapterStats = {
  receivedUnicastPackets: 0,
  sentUnicastPackets: 0,
  receivedBytes: 0,
  sentBytes: 0,
};

/**
 * 执行一次网卡统计采集
 *
 * @returns 当前网卡统计快照,获取失败时返回 null
 */
export async function collectAdapter(): Promise<AdapterStats | null> {
  const adapter = getPlatformAdapter();
  const stats = await adapter.getAdapterStats();

  if (!stats) return null;

  // 计算增量 (如果上次有数据)
  if (lastSnapshot) {
    delta = {
      receivedUnicastPackets: Math.max(0, stats.receivedUnicastPackets - lastSnapshot.receivedUnicastPackets),
      sentUnicastPackets: Math.max(0, stats.sentUnicastPackets - lastSnapshot.sentUnicastPackets),
      receivedBytes: Math.max(0, stats.receivedBytes - lastSnapshot.receivedBytes),
      sentBytes: Math.max(0, stats.sentBytes - lastSnapshot.sentBytes),
    };
  }

  lastSnapshot = stats;
  return stats;
}

/** 获取最近一次采集的增量统计 */
export function getAdapterDelta(): AdapterStats {
  return { ...delta };
}

/** 获取最近一次采集的绝对统计 */
export function getAdapterSnapshot(): AdapterStats | null {
  return lastSnapshot ? { ...lastSnapshot } : null;
}

/** 重置统计 */
export function resetAdapterStats(): void {
  lastSnapshot = null;
  delta = {
    receivedUnicastPackets: 0,
    sentUnicastPackets: 0,
    receivedBytes: 0,
    sentBytes: 0,
  };
}
