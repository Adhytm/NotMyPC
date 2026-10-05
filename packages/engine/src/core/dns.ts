/**
 * 核心 DNS 解析测试模块
 *
 * 使用 Node.js 内置 dns.promises 模块测试 DNS 解析速度和成功率。
 * DNS 解析慢/失败是 "网页打不开但 ping 通" 的常见原因。
 */

import { promises as dnsPromises } from 'node:dns';
import type { DnsResult, DnsStats, MonitorConfig } from '../types.js';
import { DNS_SLOW_THRESHOLD_MS, MAX_LATENCY_HISTORY } from '../config.js';

/** 内存中的 DNS 统计 */
let stats: DnsStats = { total: 0, fail: 0, slow: 0, times: [] };

/**
 * 对单个域名执行 DNS 解析测试
 *
 * 优先用 resolve4 (c-ares 直连 DNS 服务器, 能测出真实解析耗时);
 * 家用路由器把 DNS 配成 IPv6 链路本地地址 (fe80::1%8) 时 c-ares 会
 * ECONNREFUSED/EDESTRUCTION, 此时回退到 lookup (走系统解析器),
 * 反映用户浏览器真实的解析体验。
 */
export async function dnsOnce(domain: string): Promise<DnsResult> {
  const timestamp = new Date().toISOString();
  const start = performance.now();

  try {
    const addresses = await dnsPromises.resolve4(domain);
    const timeMs = Math.round(performance.now() - start);

    return {
      domain,
      ok: true,
      timeMs,
      result: addresses.join(', '),
      timestamp,
    };
  } catch (e: any) {
    // resolve4 失败 → 系统解析器回退 (浏览器实际走的路径)
    try {
      const info = await dnsPromises.lookup(domain, { family: 4 });
      const timeMs = Math.round(performance.now() - start);
      return {
        domain,
        ok: true,
        timeMs,
        result: `${info.address} (系统解析回退)`,
        timestamp,
      };
    } catch {
      const timeMs = Math.round(performance.now() - start);
      return {
        domain,
        ok: false,
        timeMs,
        result: e?.code ?? String(e?.message ?? e),
        timestamp,
      };
    }
  }
}

/**
 * 对配置中的所有域名执行一轮 DNS 测试
 */
export async function dnsAll(config: MonitorConfig): Promise<DnsResult[]> {
  const results = await Promise.all(
    config.dnsDomains.map((d) => dnsOnce(d))
  );
  for (const r of results) {
    updateStats(r);
  }
  return results;
}

/** 将单次结果写入统计 */
function updateStats(result: DnsResult): void {
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
  if (result.timeMs > DNS_SLOW_THRESHOLD_MS) {
    stats.slow += 1;
  }
}

/** 获取 DNS 汇总统计 */
export function getDnsStats(): DnsStats {
  return { ...stats, times: [...stats.times] };
}

/** 重置统计 */
export function resetDnsStats(): void {
  stats = { total: 0, fail: 0, slow: 0, times: [] };
}

/** 检测异常 */
export function detectDnsAnomaly(
  result: DnsResult
): { type: string; message: string } | null {
  if (!result.ok) {
    return {
      type: 'DNS失败',
      message: `[${result.domain}] ${result.result}`,
    };
  }
  if (result.timeMs > DNS_SLOW_THRESHOLD_MS) {
    return {
      type: 'DNS慢解析',
      message: `[${result.domain}] ${result.timeMs}ms > ${DNS_SLOW_THRESHOLD_MS}ms`,
    };
  }
  return null;
}
