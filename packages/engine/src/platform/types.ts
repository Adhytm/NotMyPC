/**
 * 平台抽象层接口定义
 *
 * 所有平台 (Windows/Linux/macOS) 必须实现此接口。
 * core/ 和 collector/ 模块通过此接口调用系统命令,
 * 不直接依赖任何特定平台的实现。
 *
 * 核心原则: 新增平台只需实现此接口,core/collector/export 零改动。
 */

import type { PingResult, WifiInfo, AdapterStats, IpConfigInfo } from '../types.js';

export interface PlatformAdapter {
  /** 平台标识 (如 "windows" / "linux" / "macos") */
  readonly platform: string;

  /**
   * 执行单次 ICMP Ping 探测
   *
   * @param host 目标 IP 或域名
   * @param timeoutMs 单次超时时间 (毫秒)
   * @param targetName 目标名称 (用于日志标识)
   * @returns Ping 探测结果
   */
  ping(host: string, timeoutMs: number, targetName: string): Promise<PingResult>;

  /**
   * 获取当前 Wi-Fi 连接的详细信息
   *
   * @returns Wi-Fi 状态信息,设备不支持 Wi-Fi 或获取失败时返回 null
   */
  getWifiInfo(): Promise<WifiInfo | null>;

  /**
   * 读取网卡真实收发统计 (操作系统内核级计数器)
   *
   * @returns 网卡统计计数器,获取失败时返回 null
   */
  getAdapterStats(): Promise<AdapterStats | null>;

  // 后续版本扩展:
  // traceroute(host: string, maxHops: number, timeoutMs: number): Promise<string>;

  /**
   * 获取当前网络接口的 IP/网关/DNS 配置
   *
   * 异常快照的一部分, 用于记录故障发生时的网络配置状态。
   * 可帮助排查 DHCP 地址变更、网关漂移、DNS 服务器异常等问题。
   *
   * @returns IP 配置信息, 获取失败时返回 null
   */
  getIpConfig(): Promise<IpConfigInfo | null>;

  /**
   * 获取系统路由表
   *
   * 异常快照的一部分, 用于分析故障时的路由路径。
   * 可帮助排查默认路由消失、静态路由冲突等问题。
   *
   * @returns 路由表文本输出, 获取失败时返回错误信息
   */
  getRouteTable(): Promise<string>;

  /**
   * 获取系统 ARP 缓存表
   *
   * 异常快照和故障诊断的一部分。通过检查网关 IP 对应的 MAC 地址,
   * 可以排查 ARP 欺骗、网关 MAC 变更等二层网络问题。
   *
   * @returns ARP 表文本输出, 获取失败时返回错误信息
   */
  getArpTable(): Promise<string>;
}
