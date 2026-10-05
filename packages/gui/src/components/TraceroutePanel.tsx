/**
 * TraceroutePanel - 路由追踪诊断结果面板
 *
 * 显示自动诊断的路由追踪结果, 包括:
 *   - 触发原因和时间
 *   - 各目标的路由跳数和超时情况
 *   - 自动分析的故障原因
 */

'use client';

interface TraceroutePanelProps {
  result: any;
}

export default function TraceroutePanel({ result }: TraceroutePanelProps) {
  if (!result) return null;

  const traces: any[] = result.traces ?? [];
  const analysis: string[] = result.analysis ?? [];
  const time = new Date(result.timestamp).toLocaleString();

  return (
    <div className="section-panel" style={{ borderLeft: '3px solid var(--accent-orange)' }}>
      <div className="section-header">
        <h2 className="section-title" style={{ color: 'var(--accent-orange)' }}>
          <span>🔍</span> 路由追踪诊断
        </h2>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        {time} · {result.reason}
      </div>

      {/* Wi-Fi 快照 */}
      {result.wifiSnapshot && (
        <div style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: '1px solid var(--border-subtle)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
            📶 Wi-Fi 快照
          </div>
          <div className="card-rows">
            <div className="card-row">
              <span className="card-row-label">SSID</span>
              <span className="card-row-value">{result.wifiSnapshot.ssid || '-'}</span>
            </div>
            <div className="card-row">
              <span className="card-row-label">信号</span>
              <span className="card-row-value">{result.wifiSnapshot.signal || '-'}</span>
            </div>
            <div className="card-row">
              <span className="card-row-label">BSSID</span>
              <span className="card-row-value" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                {result.wifiSnapshot.bssid || '-'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 各目标追踪结果 */}
      {traces.map((trace: any, idx: number) => (
        <div key={idx} style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: '1px solid var(--border-subtle)',
        }}>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 4,
            color: trace.hasTimeout ? 'var(--accent-red)' : 'var(--accent-green)',
          }}>
            {trace.hasTimeout ? '✖' : '✔'} {trace.name} ({trace.host})
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {trace.hops.length} 跳
            {trace.firstTimeoutHop != null && (
              <span style={{ color: 'var(--accent-red)', marginLeft: 8 }}>
                第 {trace.firstTimeoutHop} 跳超时
              </span>
            )}
          </div>
          {/* 显示关键跳 */}
          <div style={{ marginTop: 4 }}>
            {getVisibleHops(trace.hops).map((hop: any, hIdx: number) => (
              <div
                key={hIdx}
                style={{
                  fontSize: 11,
                  padding: '2px 0',
                  fontFamily: 'monospace',
                  color: hop.ip === '*' ? 'var(--accent-red)' : 'var(--text-secondary)',
                }}
              >
                {hop.hop}. {hop.ip === '*' ? '* * *' : hop.ip}
                {hop.latencyMs[0] != null && (
                  <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>
                    {hop.latencyMs.filter((l: number | null) => l != null).join('/')}ms
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* 分析结论 */}
      {analysis.length > 0 && (
        <div style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: '2px solid var(--border-default)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--accent-yellow)' }}>
            📋 故障分析
          </div>
          {analysis.map((line: string, i: number) => (
            <div key={i} style={{
              fontSize: 12,
              color: 'var(--text-primary)',
              padding: '3px 0',
              paddingLeft: 12,
              borderLeft: '2px solid var(--accent-yellow)',
              marginLeft: 4,
              marginBottom: 4,
            }}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 筛选可见的关键跳: 前2 + 最后1 + 超时跳
 */
function getVisibleHops(hops: any[]): any[] {
  if (!hops || hops.length <= 5) return hops;

  const visible = new Set<number>();

  // 前 2 跳
  for (let i = 0; i < Math.min(2, hops.length); i++) visible.add(i);

  // 最后 1 跳
  visible.add(hops.length - 1);

  // 超时跳
  hops.forEach((hop, idx) => {
    if (hop.ip === '*') visible.add(idx);
  });

  return Array.from(visible)
    .sort((a, b) => a - b)
    .map((idx) => hops[idx]);
}
