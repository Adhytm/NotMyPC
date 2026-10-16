/**
 * Linux 平台适配器
 *
 * 使用 Linux 原生命令实现 PlatformAdapter 接口:
 *   - ping:    ping -c 1 -W <s> (UTF-8 输出)
 *   - Wi-Fi:   iw / iwconfig / nmcli
 *   - 网卡统计: /proc/net/dev
 */

import { execa } from 'execa';
import { readFileSync } from 'node:fs';
import type { PingResult, WifiInfo, AdapterStats, IpConfigInfo } from '../types.js';
import type { PlatformAdapter } from './types.js';

export class LinuxAdapter implements PlatformAdapter {
  readonly platform = 'linux';

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
      // Linux ping: -c 1 (发1个包), -W <秒> (整体超时), '--' 防止参数注入
      const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));
      const result = await execa('ping', ['-c', '1', '-W', String(timeoutSec), '--', sanitizedHost], {
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
   * 从 Linux ping 输出中解析延迟。
   * 格式: "time=15.3 ms" 或 "time=0.45 ms" 或 "time<1 ms"
   */
  private parseLatency(output: string): number | null {
    if (/[<]\s*1\s*ms/i.test(output)) {
      return 0.5;
    }
    const match = output.match(/time[=](\d+(?:\.\d+)?)\s*ms/i);
    if (match) {
      return parseFloat(match[1]);
    }
    return null;
  }

  async getWifiInfo(): Promise<WifiInfo | null> {
    // 尝试使用 iw dev 命令获取 Wi-Fi 信息
    try {
      // 先找到活跃的无线接口名
      const linkResult = await execa('iw', ['dev'], { timeout: 5000, reject: false });
      const linkOutput = linkResult.stdout as string;

      // 从输出中提取接口名
      const ifaceMatch = linkOutput.match(/Interface\s+(\w+)/);
      if (!ifaceMatch) {
        // 尝试 iwconfig 作为后备
        return this.getWifiViaIwconfig();
      }

      const iface = ifaceMatch[1];
      // 获取接口详细状态
      const linkInfo = await execa('iw', ['dev', iface, 'link'], {
        timeout: 5000,
        reject: false,
      });
      const infoOutput = linkInfo.stdout as string;

      // 获取 SSID
      const ssidResult = await execa('iw', ['dev', iface, 'info'], {
        timeout: 5000,
        reject: false,
      });
      const ssidOutput = ssidResult.stdout as string;
      const ssidMatch = ssidOutput.match(/ssid\s+(.+)/i);

      return this.parseIwOutput(infoOutput + '\n' + ssidOutput, iface, ssidMatch?.[1]?.trim() ?? '');
    } catch {
      return this.getWifiViaIwconfig();
    }
  }

  /** 使用 iwconfig 作为后备方案获取 Wi-Fi 信息 */
  private async getWifiViaIwconfig(): Promise<WifiInfo | null> {
    try {
      const result = await execa('iwconfig', ['2>/dev/null'], {
        timeout: 5000,
        reject: false,
        shell: true,
      });
      const output = result.stdout as string;
      return this.parseIwconfigOutput(output);
    } catch {
      return null;
    }
  }

  /** 解析 iw dev <iface> link 输出 */
  private parseIwOutput(output: string, iface: string, ssid: string): WifiInfo | null {
    const info: Partial<WifiInfo> = {
      ssid,
      raw: `Interface: ${iface}\n${output}`,
    };

    // BSSID: "connected to aa:bb:cc:dd:ee:ff"
    const bssidMatch = output.match(/connected to\s+([0-9a-f:]{17})/i);
    if (bssidMatch) info.bssid = bssidMatch[1];

    // 信号: "signal: -55 dBm"
    const signalMatch = output.match(/signal:\s*(-?\d+)\s*dBm/i);
    if (signalMatch) {
      info.rssi = `${signalMatch[1]} dBm`;
      // 将 dBm 转换为百分比 (近似: -100 ~ -50 dBm → 0 ~ 100%)
      const dbm = parseInt(signalMatch[1], 10);
      const pct = Math.max(0, Math.min(100, 2 * (dbm + 100)));
      info.signal = `${pct}%`;
    }

    // 速率: "rx bitrate: 433.3 MBit/s"
    const rxMatch = output.match(/rx bitrate:\s*([\d.]+\s*\S+)/i);
    if (rxMatch) info.rxRate = rxMatch[1];

    const txMatch = output.match(/tx bitrate:\s*([\d.]+\s*\S+)/i);
    if (txMatch) info.txRate = txMatch[1];

    // 频率判断波段
    const freqMatch = output.match(/freq:\s*(\d+)/i);
    if (freqMatch) {
      const freq = parseInt(freqMatch[1], 10);
      info.band = freq > 5000 ? '5GHz' : '2.4GHz';
    }

    if (info.bssid || info.ssid) {
      return {
        ssid: info.ssid ?? '',
        bssid: info.bssid ?? '',
        signal: info.signal ?? '',
        rxRate: info.rxRate ?? '',
        txRate: info.txRate ?? '',
        channel: info.channel ?? '',
        rssi: info.rssi ?? '',
        band: info.band ?? '',
        raw: info.raw ?? output,
      };
    }
    return null;
  }

  /** 解析 iwconfig 输出 */
  private parseIwconfigOutput(output: string): WifiInfo | null {
    const info: Partial<WifiInfo> = { raw: output };

    // 接口名 (第一行)
    const ifaceMatch = output.match(/^(\w+)/);
    const iface = ifaceMatch?.[1] ?? 'wlan0';

    // ESSID: 'NetworkName'
    const ssidMatch = output.match(/ESSID[=:]"([^"]*)"/i);
    if (ssidMatch) info.ssid = ssidMatch[1];

    // Access Point: aa:bb:cc:dd:ee:ff
    const bssidMatch = output.match(/Access Point:\s*([0-9a-f:]{17})/i);
    if (bssidMatch) info.bssid = bssidMatch[1];

    // Frequency:2.462 GHz
    const freqMatch = output.match(/Frequency[=:](\d+(?:\.\d+)?)/i);
    if (freqMatch) {
      const freq = parseFloat(freqMatch[1]);
      info.band = freq > 5 ? '5GHz' : '2.4GHz';
      info.channel = String(Math.round(freq));
    }

    // Signal level=-55 dBm
    const signalMatch = output.match(/Signal level[=](-?\d+)/i);
    if (signalMatch) {
      info.rssi = `${signalMatch[1]} dBm`;
      const dbm = parseInt(signalMatch[1], 10);
      const pct = Math.max(0, Math.min(100, 2 * (dbm + 100)));
      info.signal = `${pct}%`;
    }

    // Bit Rate: 433 Mb/s
    const rateMatch = output.match(/Bit Rate[=:](\d+(?:\.\d+)?\s*\S+)/i);
    if (rateMatch) {
      info.rxRate = rateMatch[1];
      info.txRate = rateMatch[1];
    }

    if (info.bssid || info.ssid) {
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

  /**
   * 通过读取 /proc/net/dev 获取网卡统计。
   * 这是 Linux 内核级计数器,最权威。
   */
  async getAdapterStats(): Promise<AdapterStats | null> {
    try {
      const content = readFileSync('/proc/net/dev', 'utf8');
      const lines = content.split('\n');

      // /proc/net/dev 格式:
      // Inter-| Receive ...
      // face |bytes packets errs drop ...
      //   wlan0: 123456 789 ...
      // 找到 wlan 接口 (优先) 或第一个非 lo 接口
      let targetLine: string | null = null;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('Inter') || trimmed.startsWith('face')) continue;
        if (trimmed.toLowerCase().startsWith('wlan') || trimmed.toLowerCase().startsWith('wl')) {
          targetLine = trimmed;
          break;
        }
        // 如果没有 wlan,取第一个非 lo 的接口
        if (!trimmed.toLowerCase().startsWith('lo') && !targetLine) {
          targetLine = trimmed;
        }
      }

      if (!targetLine) return null;

      // 解析: "wlan0: 12345 678 0 0 0 0 0 0  91011 12 0 0 0 0 0 0"
      const colonIdx = targetLine.indexOf(':');
      if (colonIdx === -1) return null;

      const dataPart = targetLine.substring(colonIdx + 1).trim();
      const fields = dataPart.split(/\s+/).map(Number);

      // /proc/net/dev 字段顺序:
      // receive: bytes packets errs drop fifo frame multicast
      // transmit: bytes packets errs drop fifo colls carrier
      if (fields.length >= 16) {
        return {
          receivedBytes: fields[0],
          receivedUnicastPackets: fields[1],
          sentBytes: fields[8],
          sentUnicastPackets: fields[9],
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 获取当前网络接口的 IP/网关/DNS 配置
   *
   * Linux: ip addr show + ip route + /etc/resolv.conf
   */
  async getIpConfig(): Promise<IpConfigInfo | null> {
    try {
      // 获取 IP 地址
      const addrResult = await execa('ip', ['addr', 'show'], {
        timeout: 5000,
        reject: false,
      });
      const addrOutput = addrResult.stdout as string;

      // 获取路由信息 (包含网关)
      const routeResult = await execa('ip', ['route'], {
        timeout: 5000,
        reject: false,
      });
      const routeOutput = routeResult.stdout as string;

      // 读取 DNS 服务器
      let dnsOutput = '';
      try {
        dnsOutput = readFileSync('/etc/resolv.conf', 'utf8');
      } catch {
        // resolv.conf 不可读
      }

      const info: IpConfigInfo = {
        ipAddresses: [],
        defaultGateway: '',
        dnsServers: [],
        raw: `=== ip addr ===\n${addrOutput}\n=== ip route ===\n${routeOutput}\n=== resolv.conf ===\n${dnsOutput}`,
      };

      // 解析 IP 地址: "inet 192.168.1.100/24 ..."
      const ipMatches = addrOutput.matchAll(/inet\s+(\d+\.\d+\.\d+\.\d+)/g);
      for (const m of ipMatches) {
        info.ipAddresses.push(m[1]);
      }

      // 解析默认网关: "default via 10.6.55.254 ..."
      const gwMatch = routeOutput.match(/default\s+via\s+(\d+\.\d+\.\d+\.\d+)/);
      if (gwMatch) info.defaultGateway = gwMatch[1];

      // 解析 DNS: "nameserver 8.8.8.8"
      const dnsMatches = dnsOutput.matchAll(/nameserver\s+(\S+)/g);
      for (const m of dnsMatches) {
        info.dnsServers.push(m[1]);
      }

      return info;
    } catch {
      return null;
    }
  }

  /**
   * 获取系统路由表 (ip route)
   */
  async getRouteTable(): Promise<string> {
    try {
      const result = await execa('ip', ['route'], {
        timeout: 5000,
        reject: false,
      });
      return result.stdout as string;
    } catch {
      return '[ip route获取失败]';
    }
  }

  /**
   * 获取系统 ARP 缓存表 (ip neigh)
   */
  async getArpTable(): Promise<string> {
    try {
      const result = await execa('ip', ['neigh'], {
        timeout: 5000,
        reject: false,
      });
      return result.stdout as string;
    } catch {
      return '[ip neigh获取失败]';
    }
  }
}
