/**
 * SnapshotPanel - 异常快照面板
 *
 * 显示最近一次异常快照 (故障现场全量保全):
 *   - 触发原因与时间
 *   - Wi-Fi / IP 配置摘要
 *   - Ping / HTTP / 下载 当时的统计状态
 *   - 可展开的原始证据 (路由表 / ARP 表 / netsh 原始输出)
 *
 * 快照是投诉时的核心证据, 面板设计突出「现场保全」属性。
 */

'use client';

import type { CSSProperties } from 'react';

interface SnapshotPanelProps {
  /** 最新快照 (无快照时传 null) */
  snapshot: any;
}

export default function SnapshotPanel({ snapshot }: SnapshotPanelProps) {
  if (!snapshot) return null;

  const time = new Date(snapshot.timestamp).toLocaleString();

  return (
    <div className="section-panel" style={{ borderLeft: '3px solid var(--accent-purple)' }}>
      <div className="section-header">
        <h2 className="section-title" style={{ color: 'var(--accent-purple)' }}>
          <span>📸</span> 异常快照
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>
            故障现场全量保全
          </span>
        </h2>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        {time} · 触发原因: <span style={{ color: 'var(--accent-orange)' }}>{snapshot.reason}</span>
      </div>

      {/* Wi-Fi / IP 配置摘要 */}
      <div className="card-rows">
        {snapshot.wifi && (
          <div className="card-row">
            <span className="card-row-label">Wi-Fi</span>
            <span className="card-row-value">{snapshot.wifi.summary || '-'}</span>
          </div>
        )}
        {snapshot.ipConfig && (
          <>
            <div className="card-row">
              <span className="card-row-label">IP 地址</span>
              <span className="card-row-value" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                {(snapshot.ipConfig.ipAddresses ?? []).join(', ') || '-'}
              </span>
            </div>
            <div className="card-row">
              <span className="card-row-label">默认网关</span>
              <span className="card-row-value" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                {snapshot.ipConfig.defaultGateway || '-'}
              </span>
            </div>
            <div className="card-row">
              <span className="card-row-label">DNS 服务器</span>
              <span className="card-row-value" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                {(snapshot.ipConfig.dnsServers ?? []).join(', ') || '-'}
              </span>
            </div>
          </>
        )}
      </div>

      {/* 当时各维度统计 */}
      <div style={{
        marginTop: 12,
        paddingTop: 12,
        borderTop: '1px solid var(--border-subtle)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
          📊 快照时刻统计
        </div>
        <div className="card-rows">
          {(snapshot.pingSummary ?? []).map((p: any) => (
            <div key={p.host} className="card-row">
              <span className="card-row-label">Ping {p.target}</span>
              <span className={`card-row-value ${p.lossRate > 0 ? 'text-red' : 'text-green'}`}>
                {p.sent}次 · 丢包{p.lossRate}%
              </span>
            </div>
          ))}
          {snapshot.httpSummary && (
            <div className="card-row">
              <span className="card-row-label">HTTP</span>
              <span className={`card-row-value ${snapshot.httpSummary.fail > 0 ? 'text-red' : 'text-green'}`}>
                {snapshot.httpSummary.total}次 · 失败{snapshot.httpSummary.fail} · 慢连接{snapshot.httpSummary.slow}
              </span>
            </div>
          )}
          {snapshot.downloadSummary && (
            <div className="card-row">
              <span className="card-row-label">下载测速</span>
              <span className={`card-row-value ${snapshot.downloadSummary.fail > 0 || snapshot.downloadSummary.stall > 0 ? 'text-yellow' : 'text-green'}`}>
                {snapshot.downloadSummary.total}次 · 失败{snapshot.downloadSummary.fail} · 停顿{snapshot.downloadSummary.stall}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 原始证据 (可展开) */}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '2px solid var(--border-default)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
          🗂 原始证据
        </div>
        {snapshot.routeTable && (
          <details style={{ marginBottom: 8 }}>
            <summary style={summaryStyle}>路由表</summary>
            <pre style={preStyle}>{snapshot.routeTable}</pre>
          </details>
        )}
        {snapshot.arpTable && (
          <details style={{ marginBottom: 8 }}>
            <summary style={summaryStyle}>ARP 缓存表</summary>
            <pre style={preStyle}>{snapshot.arpTable}</pre>
          </details>
        )}
        {snapshot.wifi?.raw && (
          <details style={{ marginBottom: 8 }}>
            <summary style={summaryStyle}>Wi-Fi 原始输出 (netsh)</summary>
            <pre style={preStyle}>{snapshot.wifi.raw}</pre>
          </details>
        )}
        {snapshot.ipConfig?.raw && (
          <details>
            <summary style={summaryStyle}>ipconfig /all 原始输出</summary>
            <pre style={preStyle}>{snapshot.ipConfig.raw}</pre>
          </details>
        )}
      </div>
    </div>
  );
}

/** 可折叠标题样式 */
const summaryStyle: CSSProperties = {
  cursor: 'pointer',
  fontSize: 12,
  color: 'var(--text-secondary)',
  padding: '4px 0',
  userSelect: 'none',
};

/** 原始输出块样式 */
const preStyle: CSSProperties = {
  margin: '4px 0 0',
  padding: 12,
  background: 'var(--bg-base)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 6,
  fontSize: 11,
  fontFamily: "'SF Mono', 'Fira Code', monospace",
  color: 'var(--text-secondary)',
  maxHeight: 240,
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
};
