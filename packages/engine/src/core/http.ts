/**
 * 核心 HTTP 连接测试模块
 *
 * 通过真实 HTTP 请求验证应用层连通性。
 * ICMP 正常但 HTTP 失败 → 可能是防火墙/代理/端口限制导致业务不可用。
 */

import type { HttpResult, HttpTarget, HttpStats, MonitorConfig } from '../types.js';
import { HTTP_SLOW_THRESHOLD_MS, MAX_LATENCY_HISTORY } from '../config.js';

/** 内存中的 HTTP 统计 */
let stats: HttpStats = { total: 0, fail: 0, slow: 0, times: [] };

/**
 * 对单个目标执行 HTTP GET 连接测试
 * 仅测量 TCP 连接 + TLS 握手 + 首字节时间,不下载 body
 */
export async function httpOnce(target: HttpTarget): Promise<HttpResult> {
  const timestamp = new Date().toISOString();
  const start = performance.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(target.url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeoutId);

    const timeMs = Math.round(performance.now() - start);
    const ok = response.status >= 200 && response.status < 400;

    return {
      name: target.name,
      url: target.url,
      ok,
      timeMs,
      info: response.status,
      timestamp,
    };
  } catch (e: any) {
    const timeMs = Math.round(performance.now() - start);
    return {
      name: target.name,
      url: target.url,
      ok: false,
      timeMs,
      info: e?.name === 'AbortError' ? '超时' : String(e?.message ?? e),
      timestamp,
    };
  }
}

/**
 * 对配置中的所有目标执行一轮 HTTP 测试
 */
export async function httpAll(config: MonitorConfig): Promise<HttpResult[]> {
  const results = await Promise.all(
    config.httpTargets.map((t) => httpOnce(t))
  );
  for (const r of results) {
    updateStats(r);
  }
  return results;
}

/** 将单次结果写入统计 */
function updateStats(result: HttpResult): void {
  stats.total += 1;
  if (!result.ok) {
    stats.fail += 1;
    return;
  }
  stats.times.push(result.timeMs);
  // 内存保护
  if (stats.times.length > MAX_LATENCY_HISTORY) {
    stats.times = stats.times.slice(-Math.floor(MAX_LATENCY_HISTORY / 2));
  }
  if (result.timeMs > HTTP_SLOW_THRESHOLD_MS) {
    stats.slow += 1;
  }
}

/** 获取 HTTP 汇总统计 */
export function getHttpStats(): HttpStats {
  return { ...stats, times: [...stats.times] };
}

/** 重置统计 */
export function resetHttpStats(): void {
  stats = { total: 0, fail: 0, slow: 0, times: [] };
}

/** 检测异常 */
export function detectHttpAnomaly(
  result: HttpResult
): { type: string; message: string } | null {
  if (!result.ok) {
    return {
      type: 'HTTP失败',
      message: `[${result.name}] ${result.url} - ${result.info}`,
    };
  }
  if (result.timeMs > HTTP_SLOW_THRESHOLD_MS) {
    return {
      type: 'HTTP慢连接',
      message: `[${result.name}] ${result.timeMs}ms > ${HTTP_SLOW_THRESHOLD_MS}ms`,
    };
  }
  return null;
}
