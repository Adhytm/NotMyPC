/**
 * DnsPanel - DNS 解析统计卡片
 */

'use client';

import { useMemo } from 'react';

interface DnsPanelProps {
  results: any[];
  summary?: any;
}

export default function DnsPanel({ results, summary }: DnsPanelProps) {
  const latestByDomain = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of results) {
      map.set(r.domain, r);
    }
    return Array.from(map.values());
  }, [results]);

  const total = results.length;
  const failed = results.filter((r) => !r.ok).length;
  const slow = results.filter((r) => r.timeMs > 200).length;

  return (
    <div className="card">
      <h3 className="card-title">
        <span className="card-icon">🔍</span> DNS 解析
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
          <span className="card-stat-label">慢解析</span>
          <span className={`card-stat-value ${slow > 0 ? 'text-yellow' : 'text-green'}`}>
            {slow}
          </span>
        </div>
      </div>

      <div className="card-rows">
        {latestByDomain.map((r) => (
          <div key={r.domain} className="card-row">
            <span className="card-row-label">{r.domain}</span>
            {r.ok ? (
              <span className={`card-row-value ${r.timeMs > 200 ? 'text-yellow' : 'text-green'}`}>
                {r.timeMs}ms
                <span style={{ color: 'var(--text-muted)', marginLeft: 4, fontSize: 11 }}>→ {r.result}</span>
              </span>
            ) : (
              <span className="card-row-value text-red">{r.result}</span>
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
