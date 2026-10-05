/**
 * 日志文件管理器
 *
 * 原版 ping.py 8 个日志文件的 TypeScript 移植。
 * 统一管理所有日志文件的写入和轮转。
 *
 * 日志文件清单 (均位于 logs 目录):
 *   - ping_log.txt       : 逐条 Ping/HTTP/DNS/Wi-Fi 流水日志
 *   - ping_spike.txt     : 仅记录异常事件 (丢包/高延迟/漫游等)
 *   - wifi_log.txt       : Wi-Fi 状态 CSV 时序
 *   - trace_log.txt      : 故障自动 tracert 路由追踪结果
 *   - timeline_log.txt   : 异常时间轴 (精确到秒)
 *   - snapshot_log.txt   : 异常快照 (全量网络状态)
 *   - raw_ping_log.txt   : Ping 命令原始输出
 *   - download_log.txt   : 下载测速日志
 *
 * 设计决策:
 *   - 使用 fs.createWriteStream 追加模式, 避免每次写入都 open/close
 *   - 轮转逻辑: >5MB → rename .bak → 新建
 *   - 引擎 startMonitor() 时初始化, stopMonitor() 时 flush + close
 */

import fs from 'node:fs';
import path from 'node:path';

/** 日志类别 */
export type LogCategory =
  | 'ping'       // ping_log.txt - 逐条流水
  | 'spike'      // ping_spike.txt - 仅异常
  | 'wifi'       // wifi_log.txt - CSV 时序
  | 'trace'      // trace_log.txt - 路由追踪
  | 'timeline'   // timeline_log.txt - 异常时间轴
  | 'snapshot'   // snapshot_log.txt - 异常快照
  | 'rawping'    // raw_ping_log.txt - 原始输出
  | 'download';  // download_log.txt - 下载测速

/** 各类别对应的文件名 */
const FILE_NAMES: Record<LogCategory, string> = {
  ping: 'ping_log.txt',
  spike: 'ping_spike.txt',
  wifi: 'wifi_log.txt',
  trace: 'trace_log.txt',
  timeline: 'timeline_log.txt',
  snapshot: 'snapshot_log.txt',
  rawping: 'raw_ping_log.txt',
  download: 'download_log.txt',
};

/** 日志轮转阈值 (5MB) */
const LOG_MAX_BYTES = 5 * 1024 * 1024;

/** 日志管理器单例 */
class LogManager {
  private streams = new Map<LogCategory, fs.WriteStream>();
  private logDir: string;
  private initialized = false;

  constructor(logDir = 'logs') {
    this.logDir = logDir;
  }

  /**
   * 初始化日志系统
   *
   * 创建 logs 目录 (如不存在), 执行轮转检查, 打开所有写入流。
   */
  init(): void {
    if (this.initialized) return;

    // 确保 logs 目录存在
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
      console.log(`[logger] 创建日志目录: ${this.logDir}`);
    }

    // 启动时轮转检查
    this.rotateAll();

    // 打开所有写入流 (追加模式)
    const categories = Object.keys(FILE_NAMES) as LogCategory[];
    for (const cat of categories) {
      const filePath = this.getFilePath(cat);
      const stream = fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf-8' });
      this.streams.set(cat, stream);
    }

    this.initialized = true;

    // 写入启动标记
    const now = new Date().toLocaleString('zh-CN', { hour12: false });
    this.append('ping', `\n${'='.repeat(65)}\n监控开始: ${now}\n${'='.repeat(65)}\n`);
    this.append('spike', `\n--- 异常日志 开始于 ${now} ---\n`);
    this.append('wifi', `时间,BSSID,信号强度,接收速率,发送速率,通道,RSSI,波段\n`);
    this.append('trace', `\n--- 路由追踪日志 开始于 ${now} ---\n`);
    this.append('timeline', `\n${'='.repeat(55)}\n  异常时间轴  开始于 ${now}\n${'='.repeat(55)}\n`);
    this.append('snapshot', `\n--- 异常快照日志 开始于 ${now} ---\n`);
    this.append('rawping', `\n--- Ping原始输出日志 开始于 ${now} ---\n`);
    this.append('download', `\n--- 下载测速日志 开始于 ${now} ---\n`);

    console.log(`[logger] 日志系统已初始化 (${this.logDir}/)`);
  }

  /**
   * 追加写入日志
   *
   * @param category 日志类别
   * @param content 写入内容 (自动追加换行符, 除非内容已以 \n 结尾)
   */
  append(category: LogCategory, content: string): void {
    const stream = this.streams.get(category);
    if (!stream) return;

    const text = content.endsWith('\n') ? content : content + '\n';
    stream.write(text);
  }

  /**
   * 刷新所有日志流缓冲
   */
  flushAll(): void {
    // Node.js WriteStream 默认自动 flush, 但可调用 cork/uncork 强制
    // 实际上 write() 已经是异步写入, 这里主要是语义上的保证
    for (const stream of this.streams.values()) {
      if (!stream.destroyed) {
        stream.uncork?.();
      }
    }
  }

  /**
   * 日志轮转: 文件超过 5MB 时重命名为 .bak 并新建
   */
  rotateAll(): void {
    const categories = Object.keys(FILE_NAMES) as LogCategory[];
    for (const cat of categories) {
      this.rotateFile(cat);
    }
  }

  /**
   * 关闭所有日志流
   */
  closeAll(): void {
    const now = new Date().toLocaleString('zh-CN', { hour12: false });
    this.append('ping', `\n${'='.repeat(65)}\n监控结束: ${now}\n${'='.repeat(65)}\n`);

    for (const [cat, stream] of this.streams) {
      if (!stream.destroyed) {
        stream.end();
      }
    }
    this.streams.clear();
    this.initialized = false;
    console.log('[logger] 日志系统已关闭');
  }

  /** 获取日志文件完整路径 */
  getFilePath(category: LogCategory): string {
    return path.join(this.logDir, FILE_NAMES[category]);
  }

  /** 获取所有日志文件路径 */
  getAllFilePaths(): Record<LogCategory, string> {
    const result = {} as Record<LogCategory, string>;
    const categories = Object.keys(FILE_NAMES) as LogCategory[];
    for (const cat of categories) {
      result[cat] = this.getFilePath(cat);
    }
    return result;
  }

  /** 单文件轮转 */
  private rotateFile(category: LogCategory): void {
    const filePath = this.getFilePath(category);
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.size > LOG_MAX_BYTES) {
          const bakPath = filePath + '.bak';
          if (fs.existsSync(bakPath)) {
            fs.unlinkSync(bakPath);
          }
          fs.renameSync(filePath, bakPath);
          console.log(`[logger] 日志轮转: ${FILE_NAMES[category]} → .bak`);
        }
      }
    } catch {
      // 轮转失败不影响正常运行
    }
  }
}

/** 全局日志管理器实例 */
export const logger = new LogManager();
