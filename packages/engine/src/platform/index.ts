/**
 * 平台适配器工厂
 *
 * 自动检测当前操作系统,返回对应的 PlatformAdapter 实现。
 * core/ 和 collector/ 模块只需调用 getPlatformAdapter(),
 * 不关心具体是哪个平台的实现。
 */

import type { PlatformAdapter } from './types.js';
import { WindowsAdapter } from './windows.js';
import { LinuxAdapter } from './linux.js';
import { MacosAdapter } from './macos.js';

let _adapter: PlatformAdapter | null = null;

/**
 * 获取当前平台的适配器 (单例)
 *
 * @throws 不支持的平台时抛出错误
 */
export function getPlatformAdapter(): PlatformAdapter {
  if (_adapter) return _adapter;

  switch (process.platform) {
    case 'win32':
      _adapter = new WindowsAdapter();
      break;
    case 'linux':
      _adapter = new LinuxAdapter();
      break;
    case 'darwin':
      _adapter = new MacosAdapter();
      break;
    default:
      throw new Error(
        `不支持的平台: ${process.platform}。目前仅支持 Windows / Linux / macOS。`
      );
  }

  console.log(`[engine] 平台适配器: ${_adapter.platform}`);
  return _adapter;
}

export type { PlatformAdapter } from './types.js';
