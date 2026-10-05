/**
 * EventLog - 实时事件日志流
 */

'use client';

import { useRef, useEffect } from 'react';
import type { StreamEvent } from '@/hooks/useMonitorStream';

interface EventLogProps {
  events: StreamEvent[];
  anomalies: any[];
}

/** 事件类型对应的颜色 */
const typeColors: Record<string, string> = {
  ping: 'var(--accent-blue)',
  http: 'var(--accent-green)',
  dns: 'var(--accent-purple)',
  download: 'var(--accent-orange)',
  wifi: 'var(--accent-yellow)',
  traceroute: '#ec4899',
  snapshot: 'var(--accent-purple)',
  anomaly: 'var(--accent-red)',
  timeline: '#f59e0b',
  impact: '#dc2626',
  recovery: 'var(--accent-green)',
  summary: 'var(--accent-cyan)',
  status: 'var(--text-muted)',
};

/** 格式化事件为简洁文本 */
function formatEvent(event: StreamEvent): string {
  const d = event.data;
  switch (event.type) {
    case 'ping':
      return d.ok
        ? `[${d.target}] ${d.latencyMs?.toFixed(1) ?? '?'}ms`
        : `[${d.target}] 超时`;
    case 'http':
      return d.ok
        ? `[${d.name}] ${d.timeMs}ms (${d.info})`
        : `[${d.name}] 失败: ${d.info}`;
    case 'dns':
      return d.ok
        ? `[${d.domain}] ${d.timeMs}ms → ${d.result}`
        : `[${d.domain}] 失败: ${d.result}`;
    case 'download':
      return d.ok
        ? `${d.speedMbps}MB/s, TTFB=${d.ttfbMs}ms, 停顿=${d.stalls}次`
        : `失败: ${d.error}`;
    case 'wifi':
      return `SSID: ${d.ssid}, 信号: ${d.signal || '-'}`;
    case 'traceroute':
      return `⚠ ${d.reason} → ${(d.analysis ?? []).join('; ')}`;
    case 'snapshot':
      return `📸 异常快照: ${d.reason}`;
    case 'anomaly':
      return `⚠ ${d.type}: ${d.message}`;
    case 'timeline':
      return `[${d.severity}] ${d.eventType}`;
    case 'impact':
      return `★ [${d.impactLevel}] ${d.conclusion}`;
    case 'recovery':
      return `✔ 网络恢复, 中断${d.durationSec}秒`;
    case 'summary':
      return `📊 汇总: Ping=${d.ping?.length ?? 0}目标, 异常=${d.anomalies}`;
    case 'status':
      return `引擎状态: ${d.status}`;
    default:
      return JSON.stringify(d).slice(0, 80);
  }
}

export default function EventLog({ events }: EventLogProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events.length]);

  // 只显示最近 50 条
  const recent = events.slice(-50);

  return (
    <div
      ref={listRef}
      className="event-log"
    >
      {recent.length === 0 ? (
        <div className="empty-state">
          暂无事件,启动监控后实时显示
        </div>
      ) : (
        recent.map((event, i) => {
          const time = new Date(event.timestamp).toLocaleTimeString();
          const color = typeColors[event.type] ?? 'var(--text-secondary)';
          return (
            <div key={i} className="event-log-row">
              <span className="event-log-time">{time}</span>
              <span
                className="event-log-type"
                style={{ color }}
              >
                {event.type}
              </span>
              <span className="event-log-message">{formatEvent(event)}</span>
            </div>
          );
        })
      )}
    </div>
  );
}
