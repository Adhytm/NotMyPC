/**
 * SSE 监控流 Hook
 *
 * 连接引擎的 SSE 事件流,实时接收 ping/http/dns/wifi/anomaly 事件。
 * 自动重连、心跳检测。
 */

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { api } from '@/lib/api';

/** SSE 事件数据 */
export interface StreamEvent {
  type: string;
  data: any;
  timestamp: string;
}

/** 最近 N 条事件 (用于日志面板) */
const MAX_EVENTS = 200;

export function useMonitorStream() {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    // 幂等: 已有活跃连接时不重复创建 (状态轮询会反复调用)
    if (sourceRef.current && sourceRef.current.readyState !== EventSource.CLOSED) {
      return;
    }
    if (sourceRef.current) {
      sourceRef.current.close();
    }

    const source = api.streamEvents();
    sourceRef.current = source;

    source.onopen = () => {
      setConnected(true);
    };

    source.onerror = () => {
      setConnected(false);
    };

    // 监听所有事件类型
    const eventTypes = ['ping', 'http', 'dns', 'download', 'wifi', 'traceroute', 'snapshot', 'anomaly', 'timeline', 'impact', 'recovery', 'summary', 'status'];
    for (const type of eventTypes) {
      source.addEventListener(type, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const event: StreamEvent = {
            type,
            data,
            timestamp: e.lastEventId || new Date().toISOString(),
          };
          setEvents((prev) => {
            const next = [...prev, event];
            return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
          });
        } catch {
          // 忽略解析错误
        }
      });
    }

    // 心跳事件
    source.addEventListener('heartbeat', () => {
      setConnected(true);
    });
  }, []);

  const disconnect = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
    setConnected(false);
  }, []);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  // 组件卸载时断开
  useEffect(() => {
    return () => {
      if (sourceRef.current) {
        sourceRef.current.close();
      }
    };
  }, []);

  return {
    events,
    connected,
    connect,
    disconnect,
    clearEvents,
  };
}
