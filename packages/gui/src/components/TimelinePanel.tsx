/**
 * TimelinePanel - 异常时间轴面板
 *
 * 垂直时间轴布局, 每个事件一个节点。
 * 颜色区分严重度: critical=红, warning=橙, info=蓝。
 * 显示事件类型、各目标状态、持续时间提示。
 * 自动滚动到最新事件。
 */

'use client';

import { useRef, useEffect } from 'react';

/** 时间轴事件 (与 engine types.ts 对齐) */
interface TimelineEvent {
  id: number;
  timestamp: string;
  timeStr: string;
  dateStr: string;
  eventType: string;
  severity: 'critical' | 'warning' | 'info';
  details: Record<string, { status: string; extra: string }>;
  durationHint?: string;
}

interface TimelinePanelProps {
  events: TimelineEvent[];
}

/** 严重度标签 */
const severityLabels: Record<string, string> = {
  critical: '严重',
  warning: '警告',
  info: '信息',
};

export default function TimelinePanel({ events }: TimelinePanelProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部 (最新事件)
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events.length]);

  // 只显示最近 100 条
  const recent = events.slice(-100);

  return (
    <div className="section-panel">
      <div className="section-header">
        <h2 className="section-title">
          <span>🕐</span> 异常时间轴
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>
            精确到秒, 运维对照交换机日志
          </span>
        </h2>
      </div>

      <div
        ref={listRef}
        className="timeline-container"
      >
        {recent.length === 0 ? (
          <div className="empty-state">
            暂无异常事件, 网络运行正常
          </div>
        ) : (
          <>
            <div className="timeline-line" />

            {recent.map((event) => {
              const severity = event.severity || 'info';
              return (
                <div
                  key={event.id}
                  className={`timeline-item timeline-item--${severity}`}
                >
                  <div className={`timeline-dot timeline-dot--${severity}`} />

                  <div className="timeline-header">
                    <span className="timeline-time">
                      {event.dateStr} {event.timeStr}
                    </span>
                    <span className={`timeline-severity timeline-severity--${severity}`}>
                      {severityLabels[event.severity] ?? event.severity}
                    </span>
                    <span className="timeline-event-type" style={{
                      color: severity === 'critical' ? 'var(--accent-red)' :
                             severity === 'warning' ? 'var(--accent-orange)' : 'var(--accent-blue)'
                    }}>
                      {event.eventType}
                    </span>
                  </div>

                  <div className="timeline-details">
                    {Object.entries(event.details).map(([name, detail]) => (
                      <div key={name}>
                        <span>{name}</span>
                        ：{detail.status}
                        {detail.extra && <span style={{ color: 'var(--text-muted)' }}> {detail.extra}</span>}
                      </div>
                    ))}
                  </div>

                  {event.durationHint && (
                    <div className="timeline-duration">
                      ⏱ {event.durationHint}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
