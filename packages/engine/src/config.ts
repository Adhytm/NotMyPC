/**
 * 配置常量
 *
 * 控制探测目标、频率、阈值和日志行为。
 * 调整 pingInterval 时注意:过小 (<1s) 可能触发交换机 ICMP rate-limit,
 * 导致误报丢包;过大 (>5s) 会降低异常检测的时间精度。
 */

import type { MonitorConfig } from './types.js';
import { GATEWAY_AUTO } from './core/gateway.js';

// --- Ping 探测目标 ---
// 选择原则:网关 (验证本地链路) + 两个公共 DNS (验证出口链路),
// 形成 "内-外" 交叉对照。
// 网关使用占位符 GATEWAY_AUTO ('gateway'), 启动时自动发现本机默认网关,
// 不再硬编码校园网网关 IP —— 在家/图书馆/换校区都能直接跑。
export const DEFAULT_PING_TARGETS = [
  { name: '本地网关', host: GATEWAY_AUTO },
  { name: '阿里DNS', host: '223.5.5.5' },
  { name: '腾讯DNS', host: '119.29.29.29' },
];

// --- HTTP 真实连接测试目标 ---
// 用途:验证 TCP 应用层连通性。ICMP 正常但 HTTP 失败 = 可能是防火墙/
// 代理/端口限制导致实际业务不可用。
export const DEFAULT_HTTP_TARGETS = [
  { name: '百度', url: 'http://www.baidu.com' },
  { name: 'B站', url: 'http://www.bilibili.com' },
];

// --- DNS 解析测试域名 ---
// 用途:DNS 解析慢/失败是 "网页打不开但 ping 通" 的常见原因。
export const DEFAULT_DNS_DOMAINS = ['www.baidu.com', 'www.bilibili.com'];

// --- 下载测速配置 ---
// 用途: 模拟直播/流媒体场景。很多校园网建立连接正常但传输中途卡顿,
// 普通 HTTP GET 很难发现, 但持续下载可以暴露这种问题。
export const DOWNLOAD_URL = 'https://speed.cloudflare.com/__down?bytes=5000000'; // ~5MB 测试文件
export const DOWNLOAD_INTERVAL = 60;          // 下载测速间隔 (秒)
export const DOWNLOAD_STALL_THRESHOLD_MS = 1000; // 单分块读取超过此时间视为"停顿" (ms)
export const DOWNLOAD_SLOW_MBPS = 0.5;        // 平均速度低于此值视为"慢下载" (MB/s)

// --- 探测频率 (单位:秒) ---
export const PING_INTERVAL = 2;       // 2s 保守值,不触发防火墙 ICMP rate-limit
export const HTTP_INTERVAL = 30;      // 过于频繁会被目标站限流
export const DNS_INTERVAL = 30;       // DNS 解析测试间隔
export const WIFI_INTERVAL = 15;      // 兼顾 AP 漫游检测与系统开销
export const SUMMARY_INTERVAL = 300;  // 5 分钟阶段汇总

// --- 异常判定阈值 ---
export const SPIKE_THRESHOLD_MS = 100;     // 单次 Ping 延迟超过此值视为 "高延迟" (ms)
export const HTTP_SLOW_THRESHOLD_MS = 1000; // HTTP 响应超过此值视为 "慢连接" (ms)
export const DNS_SLOW_THRESHOLD_MS = 200;   // DNS 解析超过此值视为 "慢解析" (ms)

// --- 路由追踪配置 ---
// 连续 N 轮所有目标均超时才触发 tracert,避免因单次抖动就执行耗时的路由追踪
export const CONSECUTIVE_FAIL_FOR_TRACERT = 3;
export const TRACE_COOLDOWN = 120; // tracert 冷却时间 (秒),防止频繁触发

// --- 异常快照配置 ---
// 异常快照冷却时间 (秒),防止快照刷屏,同一原因导致的连续异常不会重复捕获
export const SNAPSHOT_COOLDOWN = 30;

// --- 路由追踪目标 ---
// 诊断时追踪三个不同层级的目标,用于定位故障发生在哪一段
// 网关同样使用自动发现占位符
export const TRACE_TARGETS = [
  { name: '网关',   host: GATEWAY_AUTO, maxHops: 5 },
  { name: '阿里DNS', host: '223.5.5.5',  maxHops: 15 },
  { name: 'B站',   host: 'www.bilibili.com', maxHops: 15 },
];

// --- 内存保护 ---
export const MAX_LATENCY_HISTORY = 500; // 每个目标延迟列表最多保留条数

// --- 引擎 HTTP 服务端口 ---
export const ENGINE_PORT = Number(process.env.ENGINE_PORT ?? 3001);
export const ENGINE_HOST = process.env.ENGINE_HOST ?? '127.0.0.1';

// --- 日志目录 ---
export const LOG_DIR = 'logs';

/**
 * 构建默认监控配置
 * GUI 可通过 API 传入自定义配置覆盖默认值
 */
export function getDefaultConfig(): MonitorConfig {
  return {
    pingTargets: [...DEFAULT_PING_TARGETS],
    httpTargets: [...DEFAULT_HTTP_TARGETS],
    dnsDomains: [...DEFAULT_DNS_DOMAINS],
    pingInterval: PING_INTERVAL,
    httpInterval: HTTP_INTERVAL,
    dnsInterval: DNS_INTERVAL,
    downloadInterval: DOWNLOAD_INTERVAL,
    wifiInterval: WIFI_INTERVAL,
    summaryInterval: SUMMARY_INTERVAL,
    spikeThresholdMs: SPIKE_THRESHOLD_MS,
    maxLatencyHistory: MAX_LATENCY_HISTORY,
    consecutiveFailForTracert: CONSECUTIVE_FAIL_FOR_TRACERT,
    traceCooldown: TRACE_COOLDOWN,
    snapshotCooldown: SNAPSHOT_COOLDOWN,
  };
}
