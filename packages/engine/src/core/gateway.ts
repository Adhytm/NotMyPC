/**
 * gateway - 默认网关自动发现
 *
 * 解决"网关 IP 硬编码"问题: 原版针对校园网写死了 10.6.55.254,
 * 换网络环境 (家里/图书馆/换校区) 就全部失效。
 *
 * 发现策略 (按平台):
 *   - Windows: netstat -rn 解析活动路由表中 0.0.0.0/0 的网关,
 *     失败则回退 PowerShell Get-NetRoute (取 RouteMetric 最小的一条)
 *   - Linux:   netstat -rn 解析 0.0.0.0 行
 *   - macOS:   netstat -rn 解析 default 行
 *
 * 发现结果会缓存, 供 ping 目标解析、traceroute 诊断、API 查询复用。
 */

import { execa } from 'execa';
import path from 'node:path';
import os from 'node:os';

/** 网关占位符: 配置中 host 为此值的目标会在启动时解析为真实网关 */
export const GATEWAY_AUTO = 'gateway';

/** 缓存的发现结果 */
let cachedGateway: string | null = null;

/** Windows 系统命令绝对路径 (防 CWD 下 ping.py 之类的劫持) */
function systemCommand(name: string): string {
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
  return path.join(systemRoot, 'System32', name);
}

/** 校验是否为合法的 IPv4 网关地址 */
function isValidGateway(ip: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && ip !== '0.0.0.0';
}

/**
 * 解析 `netstat -rn` 输出, 提取默认路由网关
 *
 * 兼容三种格式:
 *   Windows: "  0.0.0.0          0.0.0.0      192.168.1.1     192.168.1.5     25"
 *   Linux:   "0.0.0.0         192.168.1.1     0.0.0.0         UG    100    0 0 eth0"
 *   macOS:   "default           192.168.1.1      UGS            en0"
 */
export function parseNetstatRoutes(output: string): string | null {
  const candidates: Array<{ gateway: string; metric: number }> = [];

  for (const line of output.split('\n')) {
    const trimmed = line.trim();

    // Windows: 目标/掩码/网关/接口/Metric 五列
    const winMatch = trimmed.match(/^0\.0\.0\.0\s+0\.0\.0\.0\s+(\S+)\s+(\S+)\s+(\d+)/);
    if (winMatch) {
      candidates.push({ gateway: winMatch[1], metric: Number(winMatch[3]) });
      continue;
    }

    // Linux: 目标/网关/掩码/Flags/Metric...
    const linuxMatch = trimmed.match(/^0\.0\.0\.0\s+(\S+)\s+0\.0\.0\.0\s+UG\S*\s+(\d+)/);
    if (linuxMatch) {
      candidates.push({ gateway: linuxMatch[1], metric: Number(linuxMatch[2]) });
      continue;
    }

    // macOS: default/网关/Flags...
    const macMatch = trimmed.match(/^default\s+(\d{1,3}(\.\d{1,3}){3})/);
    if (macMatch) {
      candidates.push({ gateway: macMatch[1], metric: 0 });
    }
  }

  // 取 Metric 最小的候选 (Metric 越小优先级越高)
  const valid = candidates.filter((c) => isValidGateway(c.gateway));
  if (valid.length === 0) return null;
  valid.sort((a, b) => a.metric - b.metric);
  return valid[0].gateway;
}

/** Windows 专用回退: PowerShell 查询默认路由 (netstat 输出异常时使用) */
async function detectGatewayViaPowerShell(): Promise<string | null> {
  try {
    const powershell = path.join(
      process.env.SystemRoot ?? 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    );
    const result = await execa(
      powershell,
      [
        '-NoProfile',
        '-Command',
        "(Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1).NextHop",
      ],
      { timeout: 5000, reject: false }
    );
    const ip = (result.stdout ?? '').trim();
    return isValidGateway(ip) ? ip : null;
  } catch {
    return null;
  }
}

/**
 * 探测当前系统的默认网关
 *
 * @param force 忽略缓存重新探测 (默认使用缓存)
 */
export async function detectDefaultGateway(force = false): Promise<string | null> {
  if (!force && cachedGateway) return cachedGateway;

  let gateway: string | null = null;
  try {
    // netstat 在三个平台上都存在; Windows 用绝对路径防劫持
    const netstatBin = process.platform === 'win32' ? systemCommand('netstat.exe') : 'netstat';
    const result = await execa(netstatBin, ['-rn'], {
      encoding: 'utf8',
      timeout: 5000,
      reject: false,
    });
    gateway = parseNetstatRoutes(result.stdout ?? '');
  } catch {
    gateway = null;
  }

  // Windows 回退路径
  if (!gateway && process.platform === 'win32') {
    gateway = await detectGatewayViaPowerShell();
  }

  if (gateway) {
    cachedGateway = gateway;
  }
  return gateway;
}

/** 获取缓存的网关 (不触发探测, 未发现时返回 null) */
export function getCachedGateway(): string | null {
  return cachedGateway;
}

/**
 * 解析目标列表中的网关占位符
 *
 * host 为 GATEWAY_AUTO 的目标会被替换为真实网关 IP;
 * 网关无法发现时该目标被移除 (并打印警告), 避免对占位符字符串做无意义的 ping。
 */
export async function resolveGatewayTargets<T extends { name: string; host: string }>(
  targets: T[],
  labelPrefix = '本地网关'
): Promise<T[]> {
  if (!targets.some((t) => t.host === GATEWAY_AUTO)) return targets;

  const gateway = await detectDefaultGateway();
  if (!gateway) {
    console.warn('[gateway] 无法发现默认网关, 网关类探测目标将被跳过');
    return targets.filter((t) => t.host !== GATEWAY_AUTO);
  }

  console.log(`[gateway] 自动发现默认网关: ${gateway} (网卡环境: ${describeNetwork()})`);
  return targets.map((t) =>
    t.host === GATEWAY_AUTO ? { ...t, name: labelPrefix, host: gateway } : t
  );
}

/** 生成当前网络环境的简短描述 (用于日志, 帮助区分家/校园网) */
function describeNetwork(): string {
  const interfaces = os.networkInterfaces();
  for (const addrs of Object.values(interfaces)) {
    if (!addrs) continue;
    const v4 = addrs.find((a) => a.family === 'IPv4' && !a.internal);
    if (v4) return `本机 IP ${v4.address}`;
  }
  return '未知网卡';
}
