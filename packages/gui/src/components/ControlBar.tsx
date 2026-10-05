/**
 * ControlBar - 启动/停止控制栏
 */

'use client';

import { api } from '@/lib/api';

interface ControlBarProps {
  running: boolean;
  connected: boolean;
  engineStatus: string;
  /** 自动发现的默认网关 (未探明时为 null) */
  gateway: string | null;
  onStart: () => void;
  onStop: () => void;
}

export default function ControlBar({
  running,
  connected,
  engineStatus,
  gateway,
  onStart,
  onStop,
}: ControlBarProps) {
  const engineDotClass = engineStatus === 'running'
    ? 'status-dot status-dot--active'
    : engineStatus === 'idle'
    ? 'status-dot status-dot--idle'
    : 'status-dot status-dot--offline';

  const engineText = engineStatus === 'running' ? '运行中' : engineStatus === 'idle' ? '空闲' : engineStatus === 'offline' ? '离线' : engineStatus;

  return (
    <div className="control-bar">
      <div className="control-bar-actions">
        <button
          onClick={onStart}
          disabled={running}
          className="btn btn-primary"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2 1.5v9l8-4.5-8-4.5z" />
          </svg>
          启动监控
        </button>

        <button
          onClick={onStop}
          disabled={!running}
          className="btn btn-danger"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect x="2" y="2" width="8" height="8" rx="1" />
          </svg>
          停止
        </button>
      </div>

      <div className="control-bar-status">
        <div className="status-badge">
          <div className={engineDotClass} />
          <span>引擎 · {engineText}</span>
        </div>

        <div className="status-badge">
          <div className={`status-dot ${connected ? 'status-dot--connected' : 'status-dot--disconnected'}`} />
          <span>SSE · {connected ? '已连接' : '未连接'}</span>
        </div>

        {/* 自动发现的网关: 展示当前网络环境, 不再硬编码校园网关 */}
        <div className="status-badge">
          <span style={{ fontFamily: 'monospace' }}>
            {gateway ? `网关 · ${gateway}` : '网关 · 探测中'}
          </span>
        </div>
      </div>

      <div className="control-bar-export">
        <a
          href={api.exportCsvUrl()}
          download="network-monitor.csv"
          className="btn btn-ghost btn-sm"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 1v6M3.5 5.5L6 8l2.5-2.5M2 10h8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          导出 CSV
        </a>

        <a
          href={api.exportJsonUrl()}
          download="network-monitor.json"
          className="btn btn-ghost btn-sm"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 1v6M3.5 5.5L6 8l2.5-2.5M2 10h8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          导出 JSON
        </a>
      </div>
    </div>
  );
}
