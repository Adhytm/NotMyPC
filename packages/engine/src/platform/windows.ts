/**
 * Windows 平台适配器
 *
 * 使用 Windows 原生命令实现 PlatformAdapter 接口:
 *   - ping:    ping -n 1 -w <ms> (GBK 编码输出)
 *   - Wi-Fi:   netsh wlan show interfaces
 *   - 网卡统计: PowerShell Get-NetAdapterStatistics
 */

import path from 'node:path';
import { execa } from 'execa';
import type { PingResult, WifiInfo, AdapterStats, IpConfigInfo } from '../types.js';
import type { PlatformAdapter } from './types.js';

/**
 * 解析 Windows 系统命令的绝对路径。
 *
 * CreateProcess 的搜索顺序是 "当前目录优先", 且 PATHEXT 可能包含 .PY 等扩展名。
 * 一旦工作目录下存在同名文件 (例如项目根目录的 ping.py), 裸命令名会被劫持,
 * 导致探测命令变成执行无关脚本。统一使用 %SystemRoot%\System32 绝对路径规避。
 */
function systemCommand(name: string): string {
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
  return path.join(systemRoot, 'System32', name);
}

/**
 * 智能解码子进程输出字节流。
 *
 * Windows 中文系统下,不同命令的输出编码不一致:
 *   - netsh           → 通常为 UTF-8 (系统代码页 65001)
 *   - ping / tracert  → 通常为 GBK (系统代码页 936)
 *   - PowerShell      → 可能是 UTF-8 或 GBK
 *
 * 因此需要按优先级依次尝试解码。
 */
function decodeOutput(raw: Buffer): string {
  // 先尝试 UTF-8 (fatal 模式,遇到无效序列会抛异常)
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return decoder.decode(raw);
  } catch {
    // UTF-8 解码失败,尝试 GBK
    try {
      const decoder = new TextDecoder('gbk');
      return decoder.decode(raw);
    } catch {
      // 最终兜底: latin1 永不失败,ASCII 部分正确
      return raw.toString('latin1');
    }
  }
}

/**
 * 从 ping 命令输出中解析延迟值。
 *
 * 兼容中英文输出与极低延迟:
 *   中文: "时间=15ms", "时间<1ms"
 *   英文: "time=15ms", "time<1ms"
 * 当延迟小于 1ms 时 (<1ms), 记为 0.5ms 以反映微秒级网络响应,
 * 并防止误落到底部汇总的 "Minimum = 0ms" 造成失真。
 */
function parseLatency(output: string): number | null {
  // 1. 优先在回复行匹配 (来自 / Reply from)
  for (const line of output.split('\n')) {
    if (line.includes('TTL=') || line.includes('ttl=')) {
      if (/[<]\s*1\s*ms/i.test(line)) {
        return 0.5;
      }
      const lineMatch = line.match(/[=]\s*(\d+(?:\.\d+)?)\s*ms/i);
      if (lineMatch) {
        return parseFloat(lineMatch[1]);
      }
    }
  }

  // 2. 兜底全局匹配
  if (/[<]\s*1\s*ms/i.test(output)) {
    return 0.5;
  }
  const match = output.match(/[=]\s*(\d+(?:\.\d+)?)\s*ms/i);
  if (match) {
    return parseFloat(match[1]);
  }
  return null;
}

export class WindowsAdapter implements PlatformAdapter {
  readonly platform = 'windows';

  async ping(host: string, timeoutMs: number, targetName: string): Promise<PingResult> {
    const timestamp = new Date().toISOString();
    const sanitizedHost = host.trim();
    if (!sanitizedHost || sanitizedHost.startsWith('-')) {
      return {
        target: targetName,
        host,
        ok: false,
        latencyMs: null,
        rawOutput: '[ping错误: 非法的主机名或参数]',
        timestamp,
      };
    }
    try {
      const result = await execa(systemCommand('ping.exe'), ['-n', '1', '-w', String(timeoutMs), sanitizedHost], {
        encoding: 'buffer',
        // execa 的 timeout 单位是毫秒: 预留 ping 自身超时 + 2s 进程余量
        timeout: timeoutMs + 2000,
        reject: false,
      });
      const output = decodeOutput(result.stdout as Buffer);
      const ok = result.exitCode === 0;
      const latency = ok ? parseLatency(output) : null;

      return {
        target: targetName,
        host,
        ok,
        latencyMs: latency,
        rawOutput: output.trim(),
        timestamp,
      };
    } catch (e) {
      return {
        target: targetName,
        host,
        ok: false,
        latencyMs: null,
        rawOutput: `[ping异常: ${e}]`,
        timestamp,
      };
    }
  }

  async getWifiInfo(): Promise<WifiInfo | null> {
    try {
      const result = await execa(systemCommand('netsh.exe'), ['wlan', 'show', 'interfaces'], {
        encoding: 'buffer',
        timeout: 5000,
        reject: false,
      });
      const output = decodeOutput(result.stdout as Buffer);
      return this.parseWifiOutput(output);
    } catch {
      return null;
    }
  }

  /**
   * 解析 netsh wlan show interfaces 输出。
   * 输出为 "Key : Value" 格式,部分字段名称在中英文系统下不同。
   */
  private parseWifiOutput(output: string): WifiInfo | null {
    const info: Partial<WifiInfo> = { raw: output };
    let hasData = false;

    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes(':')) continue;

      const colonIdx = trimmed.indexOf(':');
      const key = trimmed.substring(0, colonIdx).trim();
      const val = trimmed.substring(colonIdx + 1).trim();

      if (key === 'SSID' && val) {
        info.ssid = val;
        hasData = true;
      } else if (key === 'BSSID' || key === 'AP BSSID') {
        info.bssid = val;
        hasData = true;
      } else if (key.includes('信号') && val.includes('%')) {
        info.signal = val;
        hasData = true;
      } else if (key === '状态') {
        // 状态行
      } else if (key.includes('接收速率')) {
        info.rxRate = val;
        hasData = true;
      } else if (key.includes('传输速率')) {
        info.txRate = val;
        hasData = true;
      } else if (key === '通道' || key === '频道') {
        info.channel = val;
        hasData = true;
      } else if (key === '波段') {
        info.band = val;
        hasData = true;
      } else if (key === 'Rssi' || key === 'RSSI') {
        info.rssi = val;
        hasData = true;
      }
    }

    // 填充默认值
    if (hasData) {
      return {
        ssid: info.ssid ?? '',
        bssid: info.bssid ?? '',
        signal: info.signal ?? '',
        rxRate: info.rxRate ?? '',
        txRate: info.txRate ?? '',
        channel: info.channel ?? '',
        rssi: info.rssi ?? '',
        band: info.band ?? '',
        raw: output,
      };
    }
    return null;
  }

  async getAdapterStats(): Promise<AdapterStats | null> {
    try {
      const cmd =
        'Get-NetAdapterStatistics -Name "*WLAN*" -ErrorAction SilentlyContinue | Format-List';
      const result = await execa(
        path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        ['-Command', cmd],
        {
          encoding: 'buffer',
          timeout: 5000,
          reject: false,
        }
      );
      const output = decodeOutput(result.stdout as Buffer);
      return this.parseAdapterOutput(output);
    } catch {
      return null;
    }
  }

  /**
   * 获取当前网络接口的 IP/网关/DNS 配置 (ipconfig /all)
   *
   * 异常快照的一部分, 用于记录故障发生时的网络配置状态。
   */
  async getIpConfig(): Promise<IpConfigInfo | null> {
    try {
      const result = await execa(systemCommand('ipconfig.exe'), ['/all'], {
        encoding: 'buffer',
        timeout: 5000,
        reject: false,
      });
      const output = decodeOutput(result.stdout as Buffer);
      const info: IpConfigInfo = {
        ipAddresses: [],
        defaultGateway: '',
        dnsServers: [],
        raw: output,
      };

      for (const line of output.split('\n')) {
        const trimmed = line.trim();
        // 提取冒号后的地址值: 不能用 split(':').pop(), 因为 IPv6 地址 (fe80::1%8) 自身含冒号
        const extractValue = (text: string): string => {
          const idx = text.indexOf(':');
          return idx >= 0 ? text.slice(idx + 1).trim() : '';
        };
        if (trimmed.includes('IPv4') || trimmed.includes('IP 地址') || trimmed.includes('IP Address')) {
          const ip = extractValue(trimmed);
          if (ip) info.ipAddresses.push(ip);
        } else if (trimmed.includes('默认网关') || trimmed.includes('Default Gateway')) {
          const gw = extractValue(trimmed);
          if (gw) info.defaultGateway = gw;
        } else if (trimmed.includes('DNS 服务器') || trimmed.includes('DNS Servers')) {
          const dns = extractValue(trimmed);
          if (dns) info.dnsServers.push(dns);
        }
      }

      return info;
    } catch {
      return null;
    }
  }

  /**
   * 获取系统路由表 (route print)
   *
   * 异常快照的一部分, 用于分析故障时的路由路径。
   */
  async getRouteTable(): Promise<string> {
    try {
      const result = await execa(systemCommand('route.exe'), ['print'], {
        encoding: 'buffer',
        timeout: 5000,
        reject: false,
      });
      return decodeOutput(result.stdout as Buffer);
    } catch {
      return '[route print获取失败]';
    }
  }

  /**
   * 获取系统 ARP 缓存表 (arp -a)
   *
   * 异常快照和故障诊断的一部分。通过检查网关 IP 对应的 MAC 地址,
   * 可以排查 ARP 欺骗、网关 MAC 变更等二层网络问题。
   */
  async getArpTable(): Promise<string> {
    try {
      const result = await execa(systemCommand('arp.exe'), ['-a'], {
        encoding: 'buffer',
        timeout: 5000,
        reject: false,
      });
      return decodeOutput(result.stdout as Buffer);
    } catch {
      return '[arp获取失败]';
    }
  }

  private parseAdapterOutput(output: string): AdapterStats | null {
    const data: Record<string, number> = {};
    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.includes(':')) continue;
      const colonIdx = trimmed.indexOf(':');
      const key = trimmed.substring(0, colonIdx).trim();
      const val = trimmed.substring(colonIdx + 1).trim();
      if (/^\d+$/.test(val)) {
        data[key] = parseInt(val, 10);
      }
    }

    if (data['ReceivedUnicastPackets'] !== undefined || data['SentUnicastPackets'] !== undefined) {
      return {
        receivedUnicastPackets: data['ReceivedUnicastPackets'] ?? 0,
        sentUnicastPackets: data['SentUnicastPackets'] ?? 0,
        receivedBytes: data['ReceivedBytes'] ?? 0,
        sentBytes: data['SentBytes'] ?? 0,
      };
    }
    return null;
  }
}
