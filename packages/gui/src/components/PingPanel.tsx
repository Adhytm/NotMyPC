/**
 * PingPanel - Ping 统计卡片
 */

'use client';

import { useMemo } from 'react';

interface PingPanelProps {
  results: any[];
  summary?: any[];
}

export default function PingPanel({ results, summary }: PingPanelProps) {
  const latestByTarget = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of results) {
      map.set(r.target, r);
    }
    return Array.from(map.values());
  }, [results]);

  const totalPings = results.length;
  const failedPings = results.filter((r) => !r.ok).length;

  return (
    <div className="card">
      <h3 className="card-title">
        <span className="card-icon">🏓</span> Ping 探测
      </h3>

      <div className="card-stats">
        <div className="card-stat">
          <span className="card-stat-label">总探测</span>
          <span className="card-stat-value">{totalPings}</span>
        </div>
        <div className="card-stat">
          <span className="card-stat-label">失败</span>
          <span className={`card-stat-value ${failedPings > 0 ? 'text-red' : 'text-green'}`}>
            {failedPings}
          </span>
        </div>
      </div>

      <div className="card-rows">
        {latestByTarget.map((r) => (
          <div key={r.host} className="card-row">
            <span className="card-row-label">{r.target}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {r.ok ? (
                <span className={`card-row-value ${r.latencyMs != null && r.latencyMs > 100 ? 'text-yellow' : 'text-green'}`}>
                  {r.latencyMs != null ? `${r.latencyMs.toFixed(1)}ms` : 'OK'}
                </span>
              ) : (
                <span className="card-row-value text-red">超时</span>
              )}
              <div style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: r.ok ? 'var(--accent-green)' : 'var(--accent-red)',
                boxShadow: r.ok ? '0 0 6px rgba(34,197,94,0.5)' : '0 0 6px rgba(239,68,68,0.5)',
              }} />
            </div>
          </div>
        ))}
      </div>

      {summary && summary.length > 0 && (
        <div className="card-summary">
          {summary.map((s: any) => (
            <div key={s.host}>
              {s.target}: avg={s.avg ?? '-'}ms · 丢包{s.lossRate}% · P95={s.p95 ?? '-'}ms
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
