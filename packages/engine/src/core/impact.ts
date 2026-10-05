/**
 * 业务影响记录模块
 *
 * 原版 ping.py record_business_impact() (L969) 的 TypeScript 移植。
 * 将 HTTP/下载状态与同时刻 Ping 状态联合记录,
 * 形成「ICMP + 应用层」双重证据, 证明网络异常对实际业务的影响。
 *
 * 影响程度判定:
 *   - HTTP > 10s   → severe: 网络严重故障, 业务完全受影响
 *   - HTTP > 5s    → moderate: 网络明显异常, 视频缓冲/页面加载极慢
 *   - HTTP 失败     → severe: 网络中断, 业务完全不可用
 *
 * 触发条件: HTTP 失败或 >5s、下载测速异常时自动记录
 */

import type { BusinessImpactRecord, ImpactLevel } from '../types.js';
import { getPingStats } from './ping.js';

/** 内存中的业务影响记录列表 */
let records: BusinessImpactRecord[] = [];

/** 自增 ID 计数器 */
let nextId = 1;

/** 最大保留记录数 */
const MAX_RECORDS = 200;

/**
 * 构建当前 Ping 状态上下文
 *
 * 获取各目标最近 3 次延迟的平均值和总丢包率,
 * 作为 HTTP/下载异常同时刻的参照证据。
 */
function buildPingContext(): Record<string, string> {
  const context: Record<string, string> = {};
  const pingStats = getPingStats();

  for (const s of pingStats) {
    const lossRate = s.total > 0 ? ((s.lost / s.total) * 100).toFixed(1) : '0.0';
    const recentLats = s.latencies.slice(-3);
    if (recentLats.length > 0) {
      const avgRecent = recentLats.reduce((a, b) => a + b, 0) / recentLats.length;
      context[s.target] = `最近${recentLats.length}次平均${avgRecent.toFixed(1)}ms 总丢包${lossRate}%`;
    } else {
      context[s.target] = `无数据 总丢包${lossRate}%`;
    }
  }

  return context;
}

/**
 * 判定影响程度并生成结论
 */
function assessImpact(
  ok: boolean,
  timeMs: number,
  targetName: string
): { level: ImpactLevel; conclusion: string } {
  if (!ok) {
    return {
      level: 'severe',
      conclusion: `${targetName} 连接失败 = 网络中断, 业务完全不可用`,
    };
  }
  if (timeMs > 10000) {
    return {
      level: 'severe',
      conclusion: `${targetName} ${timeMs.toFixed(0)}ms + Ping异常 = 网络严重故障, 业务完全受影响`,
    };
  }
  if (timeMs > 5000) {
    return {
      level: 'moderate',
      conclusion: `${targetName} ${timeMs.toFixed(0)}ms = 网络明显异常, 视频缓冲/页面加载极慢`,
    };
  }
  return {
    level: 'none',
    conclusion: '',
  };
}

/**
 * 记录一条业务影响事件
 *
 * @param source 来源 ("HTTP" | "下载测速")
 * @param targetName 目标名称 (如 "百度" / "下载测速")
 * @param ok 是否成功
 * @param timeMs 耗时 (ms)
 * @param info 成功时为状态码/速度描述, 失败时为错误信息
 * @returns 创建的记录, 影响程度为 none 时返回 null
 */
export function recordBusinessImpact(
  source: string,
  targetName: string,
  ok: boolean,
  timeMs: number,
  info: string | number
): BusinessImpactRecord | null {
  const { level, conclusion } = assessImpact(ok, timeMs, targetName);

  // 无影响时不记录
  if (level === 'none') return null;

  const record: BusinessImpactRecord = {
    id: nextId++,
    timestamp: new Date().toISOString(),
    source,
    targetName,
    ok,
    timeMs,
    info,
    pingContext: buildPingContext(),
    impactLevel: level,
    conclusion,
  };

  records.push(record);

  // 内存保护: 超过上限时裁剪前一半
  if (records.length > MAX_RECORDS) {
    records = records.slice(-Math.floor(MAX_RECORDS / 2));
  }

  return record;
}

/** 获取所有业务影响记录 */
export function getImpactRecords(): BusinessImpactRecord[] {
  return [...records];
}

/** 获取最近 N 条业务影响记录 */
export function getRecentImpactRecords(count = 50): BusinessImpactRecord[] {
  return records.slice(-count);
}

/** 获取业务影响记录总数 */
export function getImpactCount(): number {
  return records.length;
}

/** 重置业务影响记录 (停止监控时调用) */
export function resetImpactRecords(): void {
  records = [];
  nextId = 1;
}
