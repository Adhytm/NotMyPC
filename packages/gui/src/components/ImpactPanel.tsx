/**
 * ImpactPanel - 业务影响记录面板
 *
 * 展示「网络异常影响实际业务」的联合证据记录:
 * HTTP/下载失败或严重变慢时, 引擎会同时记录当时各 Ping 目标的状态,
 * 形成 "应用层异常 + 网络层异常" 的交叉证明, 是投诉材料的关键组成。
 */

'use client';

/** 业务影响记录 (与 engine types.ts 对齐) */
interface ImpactRecord {
  id: number;
  timestamp: string;
  source: string;
  targetName: string;
  ok: boolean;
  timeMs: number;
  info: string | number;
  pingContext: Record<string, string>;
  impactLevel: 'severe' | 'moderate' | 'none';
  conclusion: string;
}

interface ImpactPanelProps {
  records: ImpactRecord[];
}

/** 影响程度徽章配置 */
const levelConfig: Record<string, { label: string; color: string }> = {
  severe: { label: '严重', color: 'var(--accent-red)' },
  moderate: { label: '中等', color: 'var(--accent-orange)' },
  none: { label: '轻微', color: 'var(--accent-blue)' },
};

export default function ImpactPanel({ records }: ImpactPanelProps) {
  // 最新的在前, 只显示最近 20 条
  const recent = [...records].slice(-20).reverse();

  return (
    <div className="section-panel">
      <div className="section-header">
        <h2 className="section-title">
          <span>💼</span> 业务影响记录
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>
            HTTP/下载 + Ping 联合证据
          </span>
        </h2>
        <span className="status-badge">{records.length} 条</span>
      </div>

      {recent.length === 0 ? (
        <div className="empty-state">
          暂无业务影响记录 —— 应用层访问未受网络异常影响
        </div>
      ) : (
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {recent.map((r) => {
            const level = levelConfig[r.impactLevel] ?? levelConfig.none;
            return (
              <div
                key={r.id}
                style={{
                  padding: '10px 12px',
                  marginBottom: 8,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderLeft: `3px solid ${level.color}`,
                  borderRadius: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#fff',
                    background: level.color,
                    padding: '2px 6px',
                    borderRadius: 4,
                    textTransform: 'uppercase',
                  }}>
                    {level.label}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {r.source} · {r.targetName}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto', fontFamily: 'monospace' }}>
                    {new Date(r.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  {r.conclusion}
                </div>

                {/* 同时刻 Ping 状态交叉证据 */}
                {Object.keys(r.pingContext ?? {}).length > 0 && (
                  <div style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    fontFamily: 'monospace',
                    paddingTop: 4,
                    borderTop: '1px dashed var(--border-subtle)',
                  }}>
                    {Object.entries(r.pingContext).map(([target, status]) => (
                      <span key={target} style={{ marginRight: 12 }}>
                        {target}: <span style={{ color: status.includes('正常') ? 'var(--accent-green)' : 'var(--accent-red)' }}>{status}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
