/**
 * DownloadPanel - 下载测速状态卡片
 *
 * 显示下载测速的实时状态: 速度/TTFB/停顿次数等。
 * 模拟直播/流媒体场景的卡顿检测。
 */

'use client';

interface DownloadPanelProps {
  result: any;
  summary?: any;
}

export default function DownloadPanel({ result, summary }: DownloadPanelProps) {
  const hasData = result || summary;

  return (
    <div className="card">
      <h3 className="card-title">
        <span className="card-icon">📥</span> 下载测速
      </h3>

      {hasData ? (
        <>
          {result && (
            <div className="card-rows">
              <div className="card-row">
                <span className="card-row-label">状态</span>
                <span className="card-row-value" style={{
                  color: result.ok
                    ? (result.stalls > 0 ? 'var(--accent-yellow)' : 'var(--accent-green)')
                    : 'var(--accent-red)'
                }}>
                  {result.ok
                    ? (result.stalls > 0 ? `停顿 ${result.stalls}次` : '正常')
                    : `失败: ${result.error}`}
                </span>
              </div>
              <div className="card-row">
                <span className="card-row-label">下载速度</span>
                <span className="card-row-value" style={{
                  fontSize: 18,
                  color: result.speedMbps < 0.5 ? 'var(--accent-red)' : 'var(--accent-green)',
                }}>
                  {result.ok ? `${result.speedMbps}` : '-'}
                  {result.ok && <span style={{ fontSize: 11, marginLeft: 2, color: 'var(--text-muted)' }}>MB/s</span>}
                </span>
              </div>
              <div className="card-row">
                <span className="card-row-label">TTFB</span>
                <span className="card-row-value">
                  {result.ttfbMs > 0 ? `${result.ttfbMs}ms` : '-'}
                </span>
              </div>
              <div className="card-row">
                <span className="card-row-label">最长停顿</span>
                <span className="card-row-value" style={{
                  color: result.maxStallMs > 2000 ? 'var(--accent-red)' : undefined
                }}>
                  {result.ok ? `${result.maxStallMs}ms` : '-'}
                </span>
              </div>
              <div className="card-row">
                <span className="card-row-label">停顿占比</span>
                <span className="card-row-value" style={{
                  color: result.stallRatio > 10 ? 'var(--accent-red)' : undefined
                }}>
                  {result.ok ? `${result.stallRatio}%` : '-'}
                </span>
              </div>
              <div className="card-row">
                <span className="card-row-label">下载量</span>
                <span className="card-row-value">
                  {result.totalBytes > 0
                    ? `${(result.totalBytes / 1024 / 1024).toFixed(2)} MB`
                    : '-'}
                </span>
              </div>
              <div className="card-row">
                <span className="card-row-label">耗时</span>
                <span className="card-row-value">
                  {result.durationMs > 0 ? `${(result.durationMs / 1000).toFixed(1)}s` : '-'}
                </span>
              </div>
            </div>
          )}

          {summary && summary.total > 0 && (
            <div className="card-summary">
              <div>累计 {summary.total}次 · 失败{summary.fail} · 停顿{summary.stall} · 慢{summary.slow}</div>
              {summary.avgSpeed != null && <div>平均速度: {summary.avgSpeed} MB/s</div>}
              {summary.avgTtfb != null && <div>平均TTFB: {summary.avgTtfb}ms</div>}
            </div>
          )}
        </>
      ) : (
        <div className="empty-state empty-state--card">
          等待首次下载测速...
        </div>
      )}
    </div>
  );
}
