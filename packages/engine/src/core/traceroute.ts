/**
 * 核心路由追踪模块
 *
 * 当连续多轮所有 Ping 目标均超时时, 自动执行路由追踪,
 * 定位故障点是在校园网内部、学校出口、还是运营商链路。
 *
 * 诊断流程:
 *   1. 采集 Wi-Fi 状态快照
 *   2. tracert 到网关 (定位校内链路)
 *   3. tracert 到公共 DNS (定位出口链路)
 *   4. tracert 到 www.bilibili.com (定位运营商/CDN)
 *   5. 自动分析故障原因
 */

import { execa } from 'execa';
import path from 'node:path';
import type {
  TracerouteHop,
  TracerouteTargetResult,
  DiagnosisResult,
  WifiInfo,
} from '../types.js';
import { TRACE_TARGETS } from '../config.js';
import { detectDefaultGateway, GATEWAY_AUTO } from './gateway.js';

/** 内存中的诊断结果列表 */
let diagnosisHistory: DiagnosisResult[] = [];

/** 最大保留诊断记录数 */
const MAX_DIAGNOSIS_HISTORY = 50;

// ============================================================
// 底层 tracert 命令执行
// ============================================================

import { logger } from '../logger/index.js';

/**
 * 执行 tracert/traceroute 命令, 返回原始文本输出
 *
 * @param target 目标 IP 或域名
 * @param maxHops 最大跳数
 * @param timeoutMs 每跳超时 (ms)
 */
async function execTraceroute(
  target: string,
  maxHops = 10,
  timeoutMs = 1000
): Promise<string> {
  const sanitizedTarget = target.trim();
  if (!sanitizedTarget || sanitizedTarget.startsWith('-')) {
    return '[tracert错误: 非法的目标地址]';
  }

  const platform = process.platform;
  const totalTimeout = maxHops * (timeoutMs / 1000) + 10;

  try {
    let result;

    if (platform === 'win32') {
      // Windows: tracert -d (不解析主机名, 加速输出)
      const tracertBin = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tracert.exe');
      result = await execa(tracertBin, [
        '-d', '-h', String(maxHops), '-w', String(timeoutMs), sanitizedTarget,
      ], {
        encoding: 'buffer',
        timeout: totalTimeout * 1000,
        reject: false,
      });
    } else {
      // Linux/macOS: traceroute -n (不解析主机名)
      try {
        result = await execa('traceroute', [
          '-n', '-m', String(maxHops), '-w', String(Math.ceil(timeoutMs / 1000)), '--', sanitizedTarget,
        ], {
          encoding: 'buffer',
          timeout: totalTimeout * 1000,
          reject: false,
        });
      } catch (err: any) {
        // Linux 下如果无 traceroute, 尝试回退到内置的 tracepath
        if (platform === 'linux') {
          result = await execa('tracepath', [
            '-n', '-m', String(maxHops), sanitizedTarget,
          ], {
            encoding: 'buffer',
            timeout: totalTimeout * 1000,
            reject: false,
          });
        } else {
          throw err;
        }
      }
    }

    return decodeOutput(result.stdout as Buffer);
  } catch (e: any) {
    if (e?.timedOut) return '[tracert超时]';
    return `[tracert错误: ${e?.message ?? e}]`;
  }
}

/**
 * 智能解码子进程输出字节流
 */
function decodeOutput(raw: Buffer): string {
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return decoder.decode(raw);
  } catch {
    try {
      const decoder = new TextDecoder('gbk');
      return decoder.decode(raw);
    } catch {
      return raw.toString('latin1');
    }
  }
}

// ============================================================
// tracert 输出解析
// ============================================================

/**
 * 解析 tracert/traceroute 输出为结构化的跳列表
 *
 * Windows tracert 输出格式:
 *   1    <1 ms    <1 ms    <1 ms  10.6.55.254
 *   2     5 ms     3 ms     4 ms  172.16.0.1
 *   3     *        *        *     请求超时。
 *
 * Linux/macOS traceroute 输出格式:
 *   1  10.6.55.254  0.543 ms  0.432 ms  0.398 ms
 *   2  172.16.0.1  3.456 ms  3.210 ms  3.890 ms
 *   3  * * *
 */
function parseTracerouteOutput(output: string): TracerouteHop[] {
  const hops: TracerouteHop[] = [];

  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 匹配行号开头的行 (跳过标题行)
    const hopMatch = trimmed.match(/^\s*(\d+)\s+(.*)/);
    if (!hopMatch) continue;

    const hopNum = parseInt(hopMatch[1], 10);
    const rest = hopMatch[2];

    // 检测全超时行: "* * *" 或 "请求超时"
    if (rest.includes('* * *') || rest.includes('请求超时')) {
      hops.push({
        hop: hopNum,
        ip: '*',
        latencyMs: [null, null, null],
      });
      continue;
    }

    // 提取 3 个延迟值
    const latencyValues: (number | null)[] = [];
    const latencyRegex = /(\d+(?:\.\d+)?)\s*ms/gi;
    let m: RegExpExecArray | null;
    while ((m = latencyRegex.exec(rest)) !== null && latencyValues.length < 3) {
      latencyValues.push(parseFloat(m[1]));
    }

    // 补齐到 3 个
    while (latencyValues.length < 3) {
      latencyValues.push(null);
    }

    // 提取 IP 地址 (最后一段非延迟的部分)
    // Windows: 延迟后跟 IP; Linux: IP 在延迟之前
    let ip = '*';
    const ipMatch = rest.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
    const hostnameMatch = rest.match(/([a-zA-Z][a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/);
    if (ipMatch) {
      ip = ipMatch[1];
    } else if (hostnameMatch) {
      ip = hostnameMatch[1];
    }

    hops.push({
      hop: hopNum,
      ip,
      latencyMs: latencyValues as [number | null, number | null, number | null],
    });
  }

  return hops;
}

/**
 * 检测 hops 中是否有超时, 返回第一个超时跳序号
 */
function findFirstTimeout(hops: TracerouteHop[]): number | null {
  for (const hop of hops) {
    if (hop.ip === '*' && hop.latencyMs.every((l) => l === null)) {
      return hop.hop;
    }
  }
  return null;
}

// ============================================================
// 故障分析
// ============================================================

/**
 * 根据追踪结果和 Wi-Fi 状态自动分析故障原因
 */
function analyzeDiagnosis(
  traces: TracerouteTargetResult[],
  wifi: WifiInfo | null
): string[] {
  const analysis: string[] = [];

  // 1. Wi-Fi 信号分析
  if (wifi) {
    const sigStr = wifi.signal;
    if (sigStr) {
      const sigVal = parseInt(sigStr.replace('%', ''), 10);
      if (!isNaN(sigVal)) {
        if (sigVal < 50) {
          analysis.push(`信号弱 (${sigStr}), 可能是无线链路问题`);
        } else if (sigVal < 70) {
          analysis.push(`信号一般 (${sigStr}), 可能存在干扰`);
        } else {
          analysis.push(`信号良好 (${sigStr}), 问题可能不在无线侧`);
        }
      }
    }
  }

  // 2. 网关追踪分析
  const gwTrace = traces.find((t) => t.name === '网关');
  if (gwTrace?.hasTimeout) {
    analysis.push(`网关路由追踪在第 ${gwTrace.firstTimeoutHop} 跳超时, 校园网内部链路可能有问题`);
  }

  // 3. DNS 追踪分析
  const dnsTrace = traces.find((t) => t.name === '阿里DNS');
  if (dnsTrace?.hasTimeout && !gwTrace?.hasTimeout) {
    analysis.push('网关正常但 DNS 追踪超时, 问题可能在学校出口链路');
  }

  // 4. B站追踪分析
  const biliTrace = traces.find((t) => t.name === 'B站');
  if (biliTrace?.hasTimeout) {
    analysis.push(`B站追踪第 ${biliTrace.firstTimeoutHop} 跳超时, 可能是学校出口或运营商问题`);
  }

  // 5. 兜底
  if (analysis.length === 0) {
    analysis.push('路由追踪未发现明显超时跳, 可能是瞬时抖动或 DNS/应用层问题');
  }

  return analysis;
}

// ============================================================
// 公共 API
// ============================================================

/**
 * 执行一次完整的故障诊断
 *
 * 按顺序追踪到网关/公共DNS/外网站点, 然后自动分析故障原因。
 *
 * @param reason 触发原因 (如 "3/3 目标连续超时")
 * @param wifiInfo 当前 Wi-Fi 状态快照 (可选)
 */
export async function runDiagnosis(
  reason: string,
  wifiInfo: WifiInfo | null
): Promise<DiagnosisResult> {
  const timestamp = new Date().toISOString();
  const traces: TracerouteTargetResult[] = [];

  // 网关占位符解析为自动发现的真实网关
  const gateway = await detectDefaultGateway();

  // 依次追踪各目标
  for (const target of TRACE_TARGETS) {
    if (target.host === GATEWAY_AUTO && !gateway) {
      console.warn('[traceroute] 未发现默认网关, 跳过网关追踪');
      continue;
    }
    const host = target.host === GATEWAY_AUTO ? gateway! : target.host;
    console.log(`[traceroute] 正在追踪到 ${target.name} (${host})...`);
    const rawOutput = await execTraceroute(host, target.maxHops);
    const hops = parseTracerouteOutput(rawOutput);
    const firstTimeoutHop = findFirstTimeout(hops);

    traces.push({
      name: target.name,
      host,
      maxHops: target.maxHops,
      hops,
      rawOutput,
      hasTimeout: firstTimeoutHop !== null,
      firstTimeoutHop,
    });
  }

  // 自动分析
  const analysis = analyzeDiagnosis(traces, wifiInfo);

  const result: DiagnosisResult = {
    reason,
    timestamp,
    wifiSnapshot: wifiInfo,
    traces,
    analysis,
  };

  // 存入历史
  diagnosisHistory.push(result);
  if (diagnosisHistory.length > MAX_DIAGNOSIS_HISTORY) {
    diagnosisHistory = diagnosisHistory.slice(-Math.floor(MAX_DIAGNOSIS_HISTORY / 2));
  }

  // 写入路由追踪日志文件 (trace_log.txt)
  const traceLogContent = formatDiagnosisLog(result);
  logger.append('trace', traceLogContent);

  return result;
}

/** 格式化路由追踪结果为日志文本 */
function formatDiagnosisLog(result: DiagnosisResult): string {
  const lines: string[] = [];
  lines.push('\n' + '='.repeat(65));
  lines.push(`路由追踪诊断 [${result.timestamp}]  原因: ${result.reason}`);
  lines.push('='.repeat(65));
  if (result.wifiSnapshot) {
    lines.push(`Wi-Fi环境: SSID=${result.wifiSnapshot.ssid} 信号=${result.wifiSnapshot.signal} BSSID=${result.wifiSnapshot.bssid}`);
  }
  lines.push(`诊断结论: ${result.analysis.join(' | ')}`);
  lines.push('-'.repeat(65));
  for (const t of result.traces) {
    lines.push(`\n>>> 目标: ${t.name} (${t.host})  最大跳数: ${t.maxHops}`);
    if (t.firstTimeoutHop !== null) {
      lines.push(`    ⚠ 首次超时发生于第 ${t.firstTimeoutHop} 跳`);
    } else {
      lines.push('    ✔ 链路通畅无超时');
    }
    lines.push(t.rawOutput);
  }
  lines.push('='.repeat(65) + '\n');
  return lines.join('\n');
}

/** 获取诊断历史 */
export function getDiagnosisHistory(): DiagnosisResult[] {
  return [...diagnosisHistory];
}

/** 重置诊断历史 */
export function resetDiagnosisHistory(): void {
  diagnosisHistory = [];
}
