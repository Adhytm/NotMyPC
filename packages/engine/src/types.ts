/**
 * 全局类型定义
 *
 * 这些类型在 engine 和 gui 之间共享。
 * GUI 只依赖这些类型和 HTTP API,不依赖任何平台实现细节。
 */

// ============================================================
// Ping 相关
// ============================================================

/** 单次 Ping 探测结果 */
export interface PingResult {
  /** 目标名称 (如 "学校网关") */
  target: string;
  /** 目标 IP 或域名 */
  host: string;
  /** 是否收到回复 */
  ok: boolean;
  /** 延迟毫秒数,无法解析时为 null */
  latencyMs: number | null;
  /** ping 命令原始输出文本 (用于证据保存) */
  rawOutput: string;
  /** 探测时间戳 (ISO 格式) */
  timestamp: string;
}

/** Ping 目标定义 */
export interface PingTarget {
  name: string;
  host: string;
}

/** Ping 单目标统计 */
export interface PingStats {
  target: string;
  host: string;
  /** 累计发送次数 */
  total: number;
  /** 累计丢失/超时次数 */
  lost: number;
  /** 延迟采样列表 (ms) */
  latencies: number[];
  /** 高延迟累计次数 (>= 阈值) */
  spikes: number;
}

// ============================================================
// HTTP 相关
// ============================================================

/** 单次 HTTP 连接测试结果 */
export interface HttpResult {
  /** 目标名称 (如 "百度") */
  name: string;
  /** 完整 URL */
  url: string;
  /** 是否成功 (HTTP 2xx) */
  ok: boolean;
  /** 响应耗时 (ms) */
  timeMs: number;
  /** 成功时为状态码,失败时为错误信息 */
  info: number | string;
  /** 探测时间戳 */
  timestamp: string;
}

/** HTTP 目标定义 */
export interface HttpTarget {
  name: string;
  url: string;
}

/** HTTP 汇总统计 */
export interface HttpStats {
  total: number;
  fail: number;
  /** 慢连接次数 (>1s) */
  slow: number;
  /** 响应时间采样列表 (ms) */
  times: number[];
}

// ============================================================
// DNS 相关
// ============================================================

/** 单次 DNS 解析测试结果 */
export interface DnsResult {
  domain: string;
  /** 是否解析成功 */
  ok: boolean;
  /** 解析耗时 (ms) */
  timeMs: number;
  /** 成功时为解析出的 IP,失败时为错误信息 */
  result: string;
  /** 探测时间戳 */
  timestamp: string;
}

/** DNS 汇总统计 */
export interface DnsStats {
  total: number;
  fail: number;
  /** 慢解析次数 (>200ms) */
  slow: number;
  /** 解析耗时采样列表 (ms) */
  times: number[];
}

// ============================================================
// 下载测速相关
// ============================================================

/** 单次下载测速结果 */
export interface DownloadResult {
  /** 是否下载成功 */
  ok: boolean;
  /** 首字节时间 (ms) */
  ttfbMs: number;
  /** 实际下载字节数 */
  totalBytes: number;
  /** 总耗时 (ms) */
  durationMs: number;
  /** 平均下载速度 (MB/s) */
  speedMbps: number;
  /** 停顿次数 (单分块 > 阈值) */
  stalls: number;
  /** 最长停顿 (ms) */
  maxStallMs: number;
  /** 停顿时间占比 (%) */
  stallRatio: number;
  /** 失败时的错误信息 */
  error: string | null;
  /** 探测时间戳 */
  timestamp: string;
}

/** 下载测速汇总统计 */
export interface DownloadStats {
  /** 累计测试次数 */
  total: number;
  /** 测试失败次数 */
  fail: number;
  /** 慢下载次数 (平均速度 < 阈值) */
  slow: number;
  /** 有停顿的下载次数 */
  stall: number;
  /** TTFB 采样列表 (ms) */
  ttfbs: number[];
  /** 下载速度采样列表 (MB/s) */
  speeds: number[];
  /** 每次测试的停顿次数列表 */
  stallCounts: number[];
  /** 每次测试的停顿时间占比列表 (%) */
  stallRatios: number[];
}

// ============================================================
// 路由追踪相关
// ============================================================

/** 单跳路由追踪结果 */
export interface TracerouteHop {
  /** 跳数序号 */
  hop: number;
  /** 该跳的 IP 地址或域名,无响应时为 "*" */
  ip: string;
  /** 3 次探测的延迟 (ms),无响应时为 null */
  latencyMs: [number | null, number | null, number | null];
}

/** 单个目标的路由追踪结果 */
export interface TracerouteTargetResult {
  /** 追踪目标名称 (如 "网关" / "阿里DNS") */
  name: string;
  /** 追踪目标 IP 或域名 */
  host: string;
  /** 最大跳数 */
  maxHops: number;
  /** 每一跳的解析结果 */
  hops: TracerouteHop[];
  /** 命令原始输出文本 */
  rawOutput: string;
  /** 是否有超时跳 (故障点判断依据) */
  hasTimeout: boolean;
  /** 第一个超时跳的序号 (null=全部正常) */
  firstTimeoutHop: number | null;
}

/** 一次完整的故障诊断结果 */
export interface DiagnosisResult {
  /** 触发原因 (如 "3/3 目标连续超时") */
  reason: string;
  /** 追踪时间戳 */
  timestamp: string;
  /** Wi-Fi 状态快照 */
  wifiSnapshot: WifiInfo | null;
  /** 各目标的路由追踪结果 */
  traces: TracerouteTargetResult[];
  /** 自动分析结论列表 */
  analysis: string[];
}

// ============================================================
// Wi-Fi 相关
// ============================================================

/** Wi-Fi 连接状态信息 */
export interface WifiInfo {
  /** 连接的无线网络名称 */
  ssid: string;
  /** 当前关联的 AP MAC 地址 (用于漫游检测) */
  bssid: string;
  /** 信号百分比 (如 "85%") */
  signal: string;
  /** 下行链路速率 */
  rxRate: string;
  /** 上行链路速率 */
  txRate: string;
  /** 信道编号 */
  channel: string;
  /** 接收信号强度 (负数,越小越好) */
  rssi: string;
  /** 2.4GHz 或 5GHz */
  band: string;
  /** netsh/iwconfig 原始输出 (用于快照保存) */
  raw: string;
}

/** Wi-Fi 漫游事件 */
export interface RoamingEvent {
  /** 发生时间 */
  time: string;
  /** 旧 BSSID */
  from: string;
  /** 新 BSSID */
  to: string;
  /** 漫游时的信号强度 */
  signal: string;
}

/** Wi-Fi 汇总统计 */
export interface WifiStats {
  /** AP 漫游累计次数 */
  roaming: number;
  /** 漫游事件列表 */
  history: RoamingEvent[];
  /** 最近一次采集的 Wi-Fi 状态 */
  current: WifiInfo | null;
}

// ============================================================
// 网络配置 & 异常快照
// ============================================================

/** IP 配置信息 (ipconfig /all 解析结果) */
export interface IpConfigInfo {
  /** IPv4 地址列表 (可能有多个, 如虚拟机网卡) */
  ipAddresses: string[];
  /** 默认网关 IP */
  defaultGateway: string;
  /** DNS 服务器地址列表 */
  dnsServers: string[];
  /** 原始命令输出 (用于快照保存) */
  raw: string;
}

/** 异常快照 (全量网络状态保全) */
export interface NetworkSnapshot {
  /** 快照捕获时间 (ISO 格式) */
  timestamp: string;
  /** 触发原因 (如 "全面超时" / "AP漫游" / "HTTP 失败") */
  reason: string;
  /** 系统时间 (可读格式) */
  systemTime: string;
  /** Wi-Fi 状态 (原始输出 + 解析摘要) */
  wifi: {
    raw: string;
    summary: string;
  } | null;
  /** IP 配置 (ipconfig /all) */
  ipConfig: IpConfigInfo | null;
  /** 路由表 (活跃路由, 截断到 30 行) */
  routeTable: string;
  /** ARP 缓存表 */
  arpTable: string;
  /** 当前 Ping 统计汇总 */
  pingSummary: Array<{
    target: string;
    host: string;
    sent: number;
    lost: number;
    lossRate: number;
  }>;
  /** 最近 HTTP 状态 */
  httpSummary: {
    total: number;
    fail: number;
    slow: number;
    recentTimes: number[];
  };
  /** 下载测速状态 */
  downloadSummary: {
    total: number;
    fail: number;
    stall: number;
    slow: number;
    recentSpeeds: number[];
    recentTtfbs: number[];
  };
}

// ============================================================
// 网卡统计
// ============================================================

/** 网卡收发统计计数器 */
export interface AdapterStats {
  /** 接收的单播包数 */
  receivedUnicastPackets: number;
  /** 发送的单播包数 */
  sentUnicastPackets: number;
  /** 接收字节数 */
  receivedBytes: number;
  /** 发送字节数 */
  sentBytes: number;
}

// ============================================================
// 异常时间轴相关
// ============================================================

/** 时间轴事件严重度 */
export type TimelineSeverity = 'critical' | 'warning' | 'info';

/** 时间轴中各目标的状态详情 */
export interface TimelineTargetDetail {
  status: string;
  extra: string;
}

/** 异常时间轴事件 (精确到秒, 运维可直接对照交换机日志) */
export interface TimelineEvent {
  /** 自增 ID */
  id: number;
  /** ISO 时间戳 */
  timestamp: string;
  /** 可读时间 "HH:MM:SS" */
  timeStr: string;
  /** 可读日期 "YYYY-MM-DD" */
  dateStr: string;
  /** 事件类型: "全面超时" | "部分丢包" | "高延迟告警" | "AP漫游" | "HTTP失败" | "下载停顿" | "网络恢复" */
  eventType: string;
  /** 严重度 */
  severity: TimelineSeverity;
  /** 各目标状态详情 */
  details: Record<string, TimelineTargetDetail>;
  /** 持续时间提示 (如 "距上次异常约4秒（可能持续中）") */
  durationHint?: string;
}

// ============================================================
// 业务影响记录相关
// ============================================================

/** 业务影响程度 */
export type ImpactLevel = 'severe' | 'moderate' | 'none';

/** 业务影响记录 (HTTP/下载 + Ping 联合证据) */
export interface BusinessImpactRecord {
  /** 自增 ID */
  id: number;
  /** ISO 时间戳 */
  timestamp: string;
  /** 来源: "HTTP" | "下载测速" */
  source: string;
  /** 目标名称 (如 "百度" / "下载测速") */
  targetName: string;
  /** HTTP/下载是否成功 */
  ok: boolean;
  /** 耗时 (ms) */
  timeMs: number;
  /** 成功时为状态码/速度, 失败时为错误信息 */
  info: string | number;
  /** 各 Ping 目标同时刻状态摘要 */
  pingContext: Record<string, string>;
  /** 影响程度 */
  impactLevel: ImpactLevel;
  /** 自动生成的结论文本 */
  conclusion: string;
}

// ============================================================
// 事件 & SSE 推送
// ============================================================

/** 引擎推送的事件类型 */
export type EventType =
  | 'ping'        // Ping 探测结果
  | 'http'        // HTTP 连接结果
  | 'dns'         // DNS 解析结果
  | 'download'    // 下载测速结果
  | 'wifi'        // Wi-Fi 状态更新
  | 'traceroute'  // 路由追踪结果
  | 'snapshot'    // 异常快照
  | 'anomaly'     // 异常事件 (丢包/高延迟/漫游等)
  | 'timeline'    // 异常时间轴事件
  | 'impact'      // 业务影响记录
  | 'recovery'    // 网络恢复事件
  | 'summary'     // 阶段汇总
  | 'status';     // 引擎状态变更

/** SSE 推送的事件包 */
export interface MonitorEvent {
  type: EventType;
  data: unknown;
  timestamp: string;
}

// ============================================================
// 引擎状态
// ============================================================

/** 引擎运行状态 */
export type EngineStatus = 'idle' | 'running' | 'stopping';

/** 引擎状态快照 (GET /api/monitor/status 返回) */
export interface EngineState {
  status: EngineStatus;
  /** 监控开始时间 (ISO 格式),未启动时为 null */
  startedAt: string | null;
  /** 已运行秒数 */
  uptimeSeconds: number;
  /** 当前配置 */
  config: MonitorConfig;
}

/** 监控配置 */
export interface MonitorConfig {
  pingTargets: PingTarget[];
  httpTargets: HttpTarget[];
  dnsDomains: string[];
  pingInterval: number;
  httpInterval: number;
  dnsInterval: number;
  downloadInterval: number;
  wifiInterval: number;
  summaryInterval: number;
  spikeThresholdMs: number;
  maxLatencyHistory: number;
  /** 连续 N 轮全超时才触发 tracert */
  consecutiveFailForTracert: number;
  /** tracert 冷却时间 (秒) */
  traceCooldown: number;
  /** 异常快照冷却时间 (秒), 防止快照刷屏 */
  snapshotCooldown: number;
}

/** 异常事件 */
export interface AnomalyEvent {
  type: string;
  message: string;
  timestamp: string;
}

/** 阶段汇总报告 */
export interface SummaryReport {
  timestamp: string;
  ping: Array<{
    target: string;
    host: string;
    total: number;
    lost: number;
    lossRate: number;
    spikes: number;
    min: number | null;
    max: number | null;
    avg: number | null;
    p95: number | null;
    p99: number | null;
    jitter: number | null;
  }>;
  http: {
    total: number;
    fail: number;
    slow: number;
    avg: number | null;
  };
  dns: {
    total: number;
    fail: number;
    slow: number;
    avg: number | null;
  };
  download: {
    total: number;
    fail: number;
    stall: number;
    slow: number;
    avgSpeed: number | null;
    avgTtfb: number | null;
  };
  wifi: {
    roaming: number;
  };
  traces: number;
  anomalies: number;
  uptimeSeconds: number;
}
