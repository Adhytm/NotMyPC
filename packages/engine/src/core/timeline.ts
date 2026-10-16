/**
 * 异常时间轴模块
 *
 * 原版 ping.py record_timeline() (L765) 的 TypeScript 移植。
 * 这是原版最具特色的功能——精确到秒的异常事件时间轴,
 * 运维人员可直接对照交换机/AC 日志确定故障时间点。
 *
 * 功能:
 *   - 内存中维护事件列表 (最多 500 条, 超过裁剪一半)
 *   - 事件分类: 全面超时 > 部分丢包 > 高延迟告警
 *   - 连续异常检测: 与上次事件间隔 < pingInterval*3 时附加持续时间提示
 *   - 对外 API: recordTimelineEvent(), getTimeline(), resetTimeline()
 */

import type { TimelineEvent, TimelineSeverity, TimelineTargetDetail } from '../types.js';

/** 内存中的时间轴事件列表 */
let events: TimelineEvent[] = [];

/** 自增 ID 计数器 */
let nextId = 1;

/** 最大保留事件数 */
const MAX_EVENTS = 500;

/** 上次异常事件的时间戳 (毫秒, 用于连续异常检测) */
let lastEventTimeMs = 0;

/**
 * 记录一条时间轴事件
 *
 * @param eventType 事件类型 (如 "全面超时" / "部分丢包" / "高延迟告警" / "网络恢复")
 * @param severity 严重度
 * @param details 各目标状态详情
 * @param pingIntervalSec Ping 间隔秒数 (用于连续异常判断)
 * @returns 创建的时间轴事件
 */
export function recordTimelineEvent(
  eventType: string,
  severity: TimelineSeverity,
  details: Record<string, TimelineTargetDetail>,
  pingIntervalSec = 2
): TimelineEvent {
  const now = new Date();
  const nowMs = now.getTime();

  // 连续异常检测: 与上次事件间隔 < pingInterval*3 时附加持续时间提示
  let durationHint: string | undefined;
  if (lastEventTimeMs > 0 && severity !== 'info') {
    const gap = (nowMs - lastEventTimeMs) / 1000;
    if (gap < pingIntervalSec * 3) {
      durationHint = `距上次异常约${Math.round(gap)}秒（可能持续中）`;
    }
  }

  const event: TimelineEvent = {
    id: nextId++,
    timestamp: now.toISOString(),
    timeStr: now.toLocaleTimeString('zh-CN', { hour12: false }),
    dateStr: now.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }),
    eventType,
    severity,
    details,
    durationHint,
  };

  events.push(event);

  // 内存保护: 超过上限时裁剪前一半
  if (events.length > MAX_EVENTS) {
    events = events.slice(-Math.floor(MAX_EVENTS / 2));
  }

  // 更新上次异常时间 (仅异常事件更新, 恢复事件不更新)
  if (severity !== 'info') {
    lastEventTimeMs = nowMs;
  }

  return event;
}

/**
 * 根据 Ping 轮次结果判断事件类型和严重度
 *
 * @param failCount 本轮超时目标数
 * @param totalTargets 总目标数
 * @param hasSpike 是否有高延迟 (无丢包但有高延迟)
 * @returns 事件类型和严重度, 无异常时返回 null
 */
export function classifyPingAnomaly(
  failCount: number,
  totalTargets: number,
  hasSpike: boolean
): { eventType: string; severity: TimelineSeverity } | null {
  if (failCount >= totalTargets && totalTargets > 0) {
    return { eventType: '全面超时（所有目标均不可达）', severity: 'critical' };
  }
  if (failCount > 0) {
    return {
      eventType: `部分丢包（${failCount}/${totalTargets}目标异常）`,
      severity: 'warning',
    };
  }
  if (hasSpike) {
    return { eventType: '高延迟告警', severity: 'warning' };
  }
  return null;
}

/** 获取所有时间轴事件 */
export function getTimeline(): TimelineEvent[] {
  return [...events];
}

/** 获取最近 N 条时间轴事件 */
export function getRecentTimeline(count = 100): TimelineEvent[] {
  return events.slice(-count);
}

/** 获取时间轴事件总数 */
export function getTimelineCount(): number {
  return events.length;
}

/** 重置时间轴 (停止监控时调用) */
export function resetTimeline(): void {
  events = [];
  // 保持 nextId 单调递增, 防止用户不刷新网页重新启动时触发 mergeById 冲突丢弃事件
  lastEventTimeMs = 0;
}
