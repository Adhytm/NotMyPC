/**
 * WifiPanel - Wi-Fi 状态卡片
 */

'use client';

interface WifiPanelProps {
  info: any;
  summary?: any;
}

export default function WifiPanel({ info, summary }: WifiPanelProps) {
  return (
    <div className="card">
      <h3 className="card-title">
        <span className="card-icon">📶</span> Wi-Fi 状态
      </h3>

      {info ? (
        <div className="card-rows">
          <div className="card-row">
            <span className="card-row-label">SSID</span>
            <span className="card-row-value">{info.ssid || '-'}</span>
          </div>
          <div className="card-row">
            <span className="card-row-label">BSSID</span>
            <span className="card-row-value" style={{ fontSize: 11, fontFamily: 'monospace' }}>{info.bssid || '-'}</span>
          </div>
          <div className="card-row">
            <span className="card-row-label">信号强度</span>
            <span className="card-row-value" style={{ color: getSignalColor(info.signal) }}>
              {info.signal || '-'}
              {getSignalBar(info.signal)}
            </span>
          </div>
          <div className="card-row">
            <span className="card-row-label">波段</span>
            <span className="card-row-value">{info.band || '-'}</span>
          </div>
          <div className="card-row">
            <span className="card-row-label">信道</span>
            <span className="card-row-value">{info.channel || '-'}</span>
          </div>
          <div className="card-row">
            <span className="card-row-label">速率</span>
            <span className="card-row-value">
              <span className="text-green">↓</span>{info.rxRate || '-'}
              {' '}
              <span className="text-blue">↑</span>{info.txRate || '-'}
            </span>
          </div>
          <div className="card-row">
            <span className="card-row-label">RSSI</span>
            <span className="card-row-value">{info.rssi || '-'} dBm</span>
          </div>
        </div>
      ) : (
        <div className="empty-state empty-state--card">
          未检测到 Wi-Fi 连接
        </div>
      )}

      {summary && summary.roaming > 0 && (
        <div className="card-summary" style={{ color: 'var(--accent-yellow)' }}>
          漫游次数: {summary.roaming}
        </div>
      )}
    </div>
  );
}

function getSignalColor(signal: string): string {
  const pct = parseInt(signal, 10);
  if (isNaN(pct)) return 'var(--text-primary)';
  if (pct >= 70) return 'var(--accent-green)';
  if (pct >= 40) return 'var(--accent-yellow)';
  return 'var(--accent-red)';
}

function getSignalBar(signal: string): string {
  const pct = parseInt(signal, 10);
  if (isNaN(pct)) return '';
  if (pct >= 80) return ' ████';
  if (pct >= 60) return ' ███';
  if (pct >= 40) return ' ██';
  return ' █';
}
