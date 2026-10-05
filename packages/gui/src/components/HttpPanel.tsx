/**
 * HttpPanel - HTTP 连接统计卡片
 */

'use client';

import { useMemo } from 'react';

interface HttpPanelProps {
  results: any[];
  summary?: any;
}

export default function HttpPanel({ results, summary }: HttpPanelProps) {
  const latestByTarget = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of results) {
      map.set(r.name, r);
    }
    return Array.from(map.values());
  }, [results]);

  const total = results.length;
  const failed = results.filter((r) => !r.ok).length;
  const slow = results.filter((r) => r.timeMs > 1000).length;

  return (
    <div className="card">
      <h3 className="card-title">
        <span className="card-icon">🌍</span> HTTP 连接
      </h3>

      <div className="card-stats">
        <div className="card-stat">
          <span className="card-stat-label">总测试</span>
          <span className="card-stat-value">{total}</span>
        </div>
        <div className="card-stat">
          <span className="card-stat-label">失败</span>
          <span className={`card-stat-value ${failed > 0 ? 'text-red' : 'text-green'}`}>
            {failed}
          </span>
        </div>
        <div className="card-stat">
          <span className="card-stat-label">慢连接</span>
          <span className={`card-stat-value ${slow > 0 ? 'text-yellow' : 'text-green'}`}>
            {slow}
          </span>
        </div>
      </div>

      <div className="card-rows">
        {latestByTarget.map((r) => (
          <div key={r.url} className="card-row">
            <span className="card-row-label">{r.name}</span>
            {r.ok ? (
              <span className={`card-row-value ${r.timeMs > 1000 ? 'text-yellow' : 'text-green'}`}>
                {r.timeMs}ms
                <span style={{ color: 'var(--text-muted)', marginLeft: 4, fontSize: 11 }}>({r.info})</span>
              </span>
            ) : (
              <span className="card-row-value text-red">{r.info}</span>
            )}
          </div>
        ))}
      </div>

      {summary && (
        <div className="card-summary">
          总={summary.total} · 失败={summary.fail} · 慢={summary.slow} · avg={summary.avg ?? '-'}ms
        </div>
      )}
    </div>
  );
}
