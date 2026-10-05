/**
 * macOS 平台适配器
 *
 * 使用 macOS 原生命令实现 PlatformAdapter 接口:
 *   - ping:    ping -c 1 -t <s> (UTF-8 输出)
 *   - Wi-Fi:   system_profiler SPAirPortDataType
 *   - 网卡统计: netstat -ib
 */

import { execa } from 'execa';
import type { PingResult, WifiInfo, AdapterStats, IpConfigInfo } from '../types.js';
import type { PlatformAdapter } from './types.js';

export class MacosAdapter implements PlatformAdapter {
  readonly platform = 'macos';

  async ping(host: string, timeoutMs: number, targetName: string): Promise<PingResult> {
    const timestamp = new Date().toISOString();
    try {
      // macOS ping: -c 1 (发1个包), -t <秒> (整体超时)
      const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));
      const result = await execa('ping', ['-c', '1', '-t', String(timeoutSec), host], {
        // execa 的 timeout 单位是毫秒: 预留 ping 自身超时 + 2s 进程余量
        timeout: timeoutMs + 2000,
        reject: false,
      });
      const output = result.stdout as string;
      const ok = result.exitCode === 0;
      const latency = ok ? this.parseLatency(output) : null;

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

  /**
   * 从 macOS ping 输出中解析延迟。
   * 格式: "time=15.123 ms"
   */
  private parseLatency(output: string): number | null {
    const match = output.match(/time[=](\d+(?:\.\d+)?)\s*ms/i);
    if (match) {
      return parseFloat(match[1]);
    }
    return null;
  }

  async getWifiInfo(): Promise<WifiInfo | null> {
    try {
      // system_profiler 输出较为详细,解析当前连接的 Wi-Fi 信息
      const result = await execa(
        'system_profiler',
        ['SPAirPortDataType', '-json'],
        { timeout: 10000, reject: false }
      );
      const output = result.stdout as string;

      // system_profiler -json 输出 JSON 格式
      // 尝试解析 JSON
      try {
        const data = JSON.parse(output);
        return this.parseWifiJson(data, output);
      } catch {
        // JSON 解析失败,尝试文本解析
        return this.parseWifiText(output);
      }
    } catch {
      // 后备:尝试 networksetup 命令
      return this.getWifiViaNetworksetup();
    }
  }

  /** 从 system_profiler JSON 输出解析 Wi-Fi 信息 */
  private parseWifiJson(data: any, rawOutput: string): WifiInfo | null {
    try {
      // 导航到当前 Wi-Fi 连接信息
      const airport = data?.SPAirPortDataType?.[0];
      // 这里的 JSON 结构可能因 macOS 版本不同而异
      // 尝试多个可能的路径
      const wifiData =
        airport?.spairport_airport_other?.local_wifi?._items?.[0] ??
        airport?.CurrentNetworkInfo ??
        airport?.current_network_info ??
        null;

      if (!wifiData) return null;

      const ssid = wifiData?.spairport_network_name?._value ?? wifiData?.SSID ?? '';
      const bssid = wifiData?.spairport_bssid?._value ?? wifiData?.BSSID ?? '';
      const signal = wifiData?.spairport_signal?._value ?? wifiData?.signal ?? '';
      const noise = wifiData?.spairport_noise?._value ?? wifiData?.noise ?? '';
      const channel = wifiData?.spairport_channel?._value ?? wifiData?.channel ?? '';
      const txRate = wifiData?.spairport_tx_rate?._value ?? wifiData?.txRate ?? '';
      const rssi = signal ? `${signal} dBm` : '';

      // 将 RSSI (dBm) 转换为百分比
      let signalPct = '';
      if (signal) {
        const dbm = parseInt(String(signal), 10);
        if (!isNaN(dbm)) {
          const pct = Math.max(0, Math.min(100, 2 * (dbm + 100)));
          signalPct = `${pct}%`;
        }
      }

      const band = channel ? (parseInt(String(channel), 10) > 14 ? '5GHz' : '2.4GHz') : '';

      if (ssid || bssid) {
        return {
          ssid,
          bssid,
          signal: signalPct,
          rxRate: '',
          txRate: txRate ? `${txRate} Mbps` : '',
          channel: String(channel),
          rssi,
          band,
          raw: rawOutput,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /** 从 system_profiler 文本输出解析 (后备) */
  private parseWifiText(output: string): WifiInfo | null {
    const info: Partial<WifiInfo> = { raw: output };

    const ssidMatch = output.match(/Current Network Name:\s*(.+)/i);
    if (ssidMatch) info.ssid = ssidMatch[1].trim();

    const bssidMatch = output.match(/BSSID:\s*([0-9a-f:]{17})/i);
    if (bssidMatch) info.bssid = bssidMatch[1];

    const signalMatch = output.match(/signal:\s*(-?\d+)/i) ?? output.match(/aggrRSSI:\s*(-?\d+)/i);
    if (signalMatch) {
      info.rssi = `${signalMatch[1]} dBm`;
      const dbm = parseInt(signalMatch[1], 10);
      const pct = Math.max(0, Math.min(100, 2 * (dbm + 100)));
      info.signal = `${pct}%`;
    }

    const channelMatch = output.match(/channel:\s*(\d+)/i) ?? output.match(/aggrChannel:\s*(\d+)/i);
    if (channelMatch) {
      info.channel = channelMatch[1];
      info.band = parseInt(channelMatch[1], 10) > 14 ? '5GHz' : '2.4GHz';
    }

    const txRateMatch = output.match(/lastTxRate:\s*(\d+)/i);
    if (txRateMatch) {
      info.txRate = `${txRateMatch[1]} Mbps`;
      info.rxRate = `${txRateMatch[1]} Mbps`;
    }

    if (info.ssid || info.bssid) {
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

  /** 使用 networksetup 作为后备获取 Wi-Fi 信息 */
  private async getWifiViaNetworksetup(): Promise<WifiInfo | null> {
    try {
      // 获取 Wi-Fi 接口名
      const listResult = await execa('networksetup', ['-listallhardwareports'], {
        timeout: 5000,
        reject: false,
      });
      const listOutput = listResult.stdout as string;

      // 找到 Wi-Fi 接口名
      const ifaceMatch = listOutput.match(/Wi-Fi.*\n.*Device:\s*(\w+)/i);
      const iface = ifaceMatch?.[1] ?? 'en0';

      // 获取 SSID
      const ssidResult = await execa('networksetup', ['-getairportnetwork', iface], {
        timeout: 5000,
        reject: false,
      });
      const ssidOutput = ssidResult.stdout as string;
      const ssidMatch = ssidOutput.match(/Current Wi-Fi Network:\s*(.+)/);

      const raw = `${listOutput}\n${ssidOutput}`;
      const ssid = ssidMatch?.[1]?.trim() ?? '';

      if (ssid) {
        return {
          ssid,
          bssid: '',
          signal: '',
          rxRate: '',
          txRate: '',
          channel: '',
          rssi: '',
          band: '',
          raw,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 通过 netstat -ib 获取网卡统计。
   * 输出格式: Name Mtu Network Address Ipkts Ierrs Opkts Oerrs Coll
   */
  async getAdapterStats(): Promise<AdapterStats | null> {
    try {
      const result = await execa('netstat', ['-ib'], { timeout: 5000, reject: false });
      const output = result.stdout as string;
      const lines = output.split('\n');

      // 优先找到 en0 (Wi-Fi) 接口
      for (const line of lines) {
        const fields = line.trim().split(/\s+/);
        if (fields.length < 10) continue;
        const name = fields[0];
        if (name === 'en0' || name === 'en1') {
          const ipkts = parseInt(fields[4], 10) || 0;
          const ibytes = parseInt(fields[6], 10) || 0; // 部分版本有 Address 列
          const opkts = parseInt(fields[6], 10) || 0;
          const obytes = parseInt(fields[8], 10) || 0;

          return {
            receivedUnicastPackets: ipkts,
            sentUnicastPackets: opkts,
            receivedBytes: ibytes,
            sentBytes: obytes,
          };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 获取当前网络接口的 IP/网关/DNS 配置
   *
   * macOS: ifconfig + netstat -rn + scutil --dns
   */
  async getIpConfig(): Promise<IpConfigInfo | null> {
    try {
      // 获取 IP 地址
      const ifconfigResult = await execa('ifconfig', [], {
        timeout: 5000,
        reject: false,
      });
      const ifconfigOutput = ifconfigResult.stdout as string;

      // 获取路由信息 (包含网关)
      const routeResult = await execa('netstat', ['-rn'], {
        timeout: 5000,
        reject: false,
      });
      const routeOutput = routeResult.stdout as string;

      // 获取 DNS 服务器
      const dnsResult = await execa('scutil', ['--dns'], {
        timeout: 5000,
        reject: false,
      });
      const dnsOutput = dnsResult.stdout as string;

      const info: IpConfigInfo = {
        ipAddresses: [],
        defaultGateway: '',
        dnsServers: [],
        raw: `=== ifconfig ===\n${ifconfigOutput}\n=== netstat -rn ===\n${routeOutput}\n=== scutil --dns ===\n${dnsOutput}`,
      };

      // 解析 IP 地址: "inet 192.168.1.100 ..."
      const ipMatches = ifconfigOutput.matchAll(/inet\s+(\d+\.\d+\.\d+\.\d+)/g);
      for (const m of ipMatches) {
        info.ipAddresses.push(m[1]);
      }

      // 解析默认网关: "default  10.6.55.254 ..."
      const gwMatch = routeOutput.match(/default\s+(\d+\.\d+\.\d+\.\d+)/);
      if (gwMatch) info.defaultGateway = gwMatch[1];

      // 解析 DNS: "nameserver[0]: 8.8.8.8"
      const dnsMatches = dnsOutput.matchAll(/nameserver\[\d+\]:\s*(\S+)/g);
      for (const m of dnsMatches) {
        if (!info.dnsServers.includes(m[1])) {
          info.dnsServers.push(m[1]);
        }
      }

      return info;
    } catch {
      return null;
    }
  }

  /**
   * 获取系统路由表 (netstat -rn)
   */
  async getRouteTable(): Promise<string> {
    try {
      const result = await execa('netstat', ['-rn'], {
        timeout: 5000,
        reject: false,
      });
      return result.stdout as string;
    } catch {
      return '[netstat -rn获取失败]';
    }
  }

  /**
   * 获取系统 ARP 缓存表 (arp -a)
   */
  async getArpTable(): Promise<string> {
    try {
      const result = await execa('arp', ['-a'], {
        timeout: 5000,
        reject: false,
      });
      return result.stdout as string;
    } catch {
      return '[arp获取失败]';
    }
  }
}
