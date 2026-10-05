/**
 * Wi-Fi 状态采集器
 *
 * 定期采集 Wi-Fi 连接状态,检测 AP 漫游事件 (BSSID 变更)。
 * 通过 PlatformAdapter 获取平台无关的 Wi-Fi 信息。
 */

import { getPlatformAdapter } from '../platform/index.js';
import type { WifiInfo, WifiStats, RoamingEvent } from '../types.js';

/** 内存中的 Wi-Fi 统计 */
let wifiStats: WifiStats = {
  roaming: 0,
  history: [],
  current: null,
};

/** 上一次采集的 BSSID (用于漫游检测) */
let lastBssid: string | null = null;

/**
 * 执行一次 Wi-Fi 状态采集
 *
 * @returns 当前 Wi-Fi 信息,如果无法获取则返回 null
 */
export async function collectWifi(): Promise<WifiInfo | null> {
  const adapter = getPlatformAdapter();
  const info = await adapter.getWifiInfo();

  if (!info) return null;

  // 漫游检测: BSSID 发生变化
  if (lastBssid && info.bssid && lastBssid !== info.bssid) {
    const event: RoamingEvent = {
      time: new Date().toISOString(),
      from: lastBssid,
      to: info.bssid,
      signal: info.signal,
    };
    wifiStats.roaming += 1;
    wifiStats.history.push(event);
  }

  if (info.bssid) {
    lastBssid = info.bssid;
  }

  wifiStats.current = info;
  return info;
}

/** 获取 Wi-Fi 汇总统计 */
export function getWifiStats(): WifiStats {
  return {
    ...wifiStats,
    history: [...wifiStats.history],
    current: wifiStats.current ? { ...wifiStats.current } : null,
  };
}

/** 重置 Wi-Fi 统计 */
export function resetWifiStats(): void {
  wifiStats = { roaming: 0, history: [], current: null };
  lastBssid = null;
}

/**
 * 检测 Wi-Fi 异常
 * 返回需要推送的异常信息
 */
export function detectWifiAnomaly(
  info: WifiInfo | null
): { type: string; message: string } | null {
  if (!info) return null;

  // 检测漫游事件
  if (wifiStats.history.length > 0) {
    const lastEvent = wifiStats.history[wifiStats.history.length - 1];
    if (lastEvent.time === new Date().toISOString().substring(0, 19)) {
      return {
        type: 'AP漫游',
        message: `BSSID 从 ${lastEvent.from} 切换到 ${lastEvent.to}, 信号 ${lastEvent.signal}`,
      };
    }
  }
  return null;
}
