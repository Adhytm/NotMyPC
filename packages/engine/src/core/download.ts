/**
 * 核心下载测速模块
 *
 * 模拟直播/流媒体场景: 很多校园网建立连接正常但传输中途卡顿,
 * 普通 HTTP HEAD 很难发现, 但持续分块下载可以暴露这种问题。
 *
 * 测量指标:
 *   - TTFB       : 首字节时间 (TCP 握手 + 服务器响应)
 *   - 总大小     : 实际下载的字节数
 *   - 总耗时     : 从发起到全部下载完成的时间
 *   - 平均速度   : MB/s
 *   - 停顿次数   : 单个分块读取超过阈值的次数
 *   - 最长停顿   : 所有停顿中最长的一次耗时
 *   - 停顿占比   : 停顿时间占总时间的百分比
 */

import type { DownloadResult, DownloadStats } from '../types.js';
import {
  DOWNLOAD_URL,
  DOWNLOAD_STALL_THRESHOLD_MS,
  DOWNLOAD_SLOW_MBPS,
  MAX_LATENCY_HISTORY,
} from '../config.js';

/** 分块大小: 16KB, 每次 read 间隔用于检测停顿 */
const CHUNK_SIZE = 16 * 1024;

/** 连接 + 读取的总超时 (ms) */
const TIMEOUT_MS = 15_000;

/** 内存中的下载统计 */
let stats: DownloadStats = {
  total: 0,
  fail: 0,
  slow: 0,
  stall: 0,
  ttfbs: [],
  speeds: [],
  stallCounts: [],
  stallRatios: [],
};

/**
 * 执行一次下载测速
 *
 * 通过 fetch + ReadableStream 分块读取, 测量 TTFB/速度/停顿。
 *
 * @param url 测试文件 URL (默认 Cloudflare ~5MB)
 */
export async function downloadOnce(url: string = DOWNLOAD_URL): Promise<DownloadResult> {
  const timestamp = new Date().toISOString();

  const result: DownloadResult = {
    ok: false,
    ttfbMs: 0,
    totalBytes: 0,
    durationMs: 0,
    speedMbps: 0,
    stalls: 0,
    maxStallMs: 0,
    stallRatio: 0,
    error: null,
    timestamp,
  };

  const start = performance.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
      },
      signal: controller.signal,
    });

    // 首字节时间 (TCP 握手 + 服务器响应)
    const ttfb = performance.now() - start;
    result.ttfbMs = Math.round(ttfb * 10) / 10;

    if (!response.ok) {
      clearTimeout(timeoutId);
      result.durationMs = Math.round((performance.now() - start) * 10) / 10;
      result.error = `HTTP ${response.status}`;
      updateStats(result);
      return result;
    }

    // 分块读取 body, 检测停顿
    const reader = response.body?.getReader();
    if (!reader) {
      clearTimeout(timeoutId);
      result.error = '无响应流';
      result.durationMs = Math.round((performance.now() - start) * 10) / 10;
      updateStats(result);
      return result;
    }

    let totalBytes = 0;
    let stallCount = 0;
    let maxStallMs = 0;
    let totalStallMs = 0;
    let lastChunkTime = performance.now();

    while (true) {
      const { done, value } = await reader.read();
      const now = performance.now();

      if (done) break;

      totalBytes += value.byteLength;
      const chunkGap = now - lastChunkTime;

      if (chunkGap > DOWNLOAD_STALL_THRESHOLD_MS) {
        stallCount += 1;
        totalStallMs += chunkGap;
        if (chunkGap > maxStallMs) {
          maxStallMs = chunkGap;
        }
      }

      lastChunkTime = now;
    }

    clearTimeout(timeoutId);

    const durationMs = performance.now() - start;
    const speedMbps = durationMs > 0
      ? (totalBytes / (1024 * 1024)) / (durationMs / 1000)
      : 0;
    const stallRatio = durationMs > 0
      ? (totalStallMs / durationMs) * 100
      : 0;

    result.ok = true;
    result.totalBytes = totalBytes;
    result.durationMs = Math.round(durationMs * 10) / 10;
    result.speedMbps = Math.round(speedMbps * 100) / 100;
    result.stalls = stallCount;
    result.maxStallMs = Math.round(maxStallMs * 10) / 10;
    result.stallRatio = Math.round(stallRatio * 10) / 10;

    updateStats(result);
    return result;
  } catch (e: any) {
    const durationMs = performance.now() - start;
    result.durationMs = Math.round(durationMs * 10) / 10;
    result.error = e?.name === 'AbortError' ? '超时' : String(e?.message ?? e).slice(0, 80);
    updateStats(result);
    return result;
  }
}

/** 将单次结果写入统计 */
function updateStats(result: DownloadResult): void {
  stats.total += 1;

  if (!result.ok) {
    stats.fail += 1;
    return;
  }

  stats.ttfbs.push(result.ttfbMs);
  stats.speeds.push(result.speedMbps);
  stats.stallCounts.push(result.stalls);
  stats.stallRatios.push(result.stallRatio);

  // 内存保护
  if (stats.ttfbs.length > MAX_LATENCY_HISTORY) {
    const half = Math.floor(MAX_LATENCY_HISTORY / 2);
    stats.ttfbs = stats.ttfbs.slice(-half);
    stats.speeds = stats.speeds.slice(-half);
    stats.stallCounts = stats.stallCounts.slice(-half);
    stats.stallRatios = stats.stallRatios.slice(-half);
  }

  // 停顿判定
  if (result.stalls > 0) {
    stats.stall += 1;
  }

  // 慢下载判定
  if (result.speedMbps < DOWNLOAD_SLOW_MBPS) {
    stats.slow += 1;
  }
}

/** 获取下载测速汇总统计 */
export function getDownloadStats(): DownloadStats {
  return {
    total: stats.total,
    fail: stats.fail,
    slow: stats.slow,
    stall: stats.stall,
    ttfbs: [...stats.ttfbs],
    speeds: [...stats.speeds],
    stallCounts: [...stats.stallCounts],
    stallRatios: [...stats.stallRatios],
  };
}

/** 重置统计 */
export function resetDownloadStats(): void {
  stats = {
    total: 0,
    fail: 0,
    slow: 0,
    stall: 0,
    ttfbs: [],
    speeds: [],
    stallCounts: [],
    stallRatios: [],
  };
}

/** 检测异常 */
export function detectDownloadAnomaly(
  result: DownloadResult
): { type: string; message: string } | null {
  if (!result.ok) {
    return {
      type: '下载失败',
      message: `下载测速失败 - ${result.error}`,
    };
  }
  if (result.stalls > 0) {
    return {
      type: '下载停顿',
      message: `下载停顿 ${result.stalls}次, 最长 ${result.maxStallMs}ms, 占比 ${result.stallRatio}%`,
    };
  }
  if (result.speedMbps < DOWNLOAD_SLOW_MBPS) {
    return {
      type: '下载慢',
      message: `下载速度 ${result.speedMbps}MB/s < ${DOWNLOAD_SLOW_MBPS}MB/s`,
    };
  }
  return null;
}
