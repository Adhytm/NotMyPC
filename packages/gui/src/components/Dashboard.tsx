/**
 * Dashboard - 主布局容器
 *
 * 整合所有监控面板、控制栏、图表和事件日志。
 * 管理 SSE 连接和全局状态。
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { useMonitorStream, type StreamEvent } from '@/hooks/useMonitorStream';
import ControlBar from './ControlBar';
import PingPanel from './PingPanel';
import HttpPanel from './HttpPanel';
import DnsPanel from './DnsPanel';
import WifiPanel from './WifiPanel';
import DownloadPanel from './DownloadPanel';
import TraceroutePanel from './TraceroutePanel';
import SnapshotPanel from './SnapshotPanel';
import TimelinePanel from './TimelinePanel';
import ImpactPanel from './ImpactPanel';
import LatencyChart from './LatencyChart';
import EventLog from './EventLog';

/** 从 SSE 事件流中提取最近的数据 */
function useLatestData(events: StreamEvent[]) {
  return useMemo(() => {
    const pingResults: any[] = [];
    const httpResults: any[] = [];
    const dnsResults: any[] = [];
    let downloadResult: any = null;
    let wifiInfo: any = null;
    let tracerouteResult: any = null;
    let snapshot: any = null;
    const anomalies: any[] = [];
    const timelineEvents: any[] = [];
    const impacts: any[] = [];
    let summary: any = null;

    for (const event of events) {
      switch (event.type) {
        case 'ping':
          pingResults.push(event.data);
          break;
        case 'http':
          httpResults.push(event.data);
          break;
        case 'dns':
          dnsResults.push(event.data);
          break;
        case 'download':
          downloadResult = event.data;
          break;
        case 'wifi':
          wifiInfo = event.data;
          break;
        case 'traceroute':
          tracerouteResult = event.data;
          break;
        case 'snapshot':
          snapshot = event.data;
          break;
        case 'anomaly':
          anomalies.push(event.data);
          break;
        case 'timeline':
          timelineEvents.push(event.data);
          break;
        case 'impact':
          impacts.push(event.data);
          break;
        case 'summary':
          summary = event.data;
          break;
      }
    }

    return { pingResults, httpResults, dnsResults, downloadResult, wifiInfo, tracerouteResult, snapshot, anomalies, timelineEvents, impacts, summary };
  }, [events]);
}

/** 合并 REST 水合的历史记录与 SSE 新事件 (按 id 去重) */
function mergeById<T extends { id: number }>(base: T[], incoming: T[]): T[] {
  const seen = new Set(base.map((x) => x.id));
  return [...base, ...incoming.filter((x) => !seen.has(x.id))];
}

export default function Dashboard() {
  const { events, connected, connect, disconnect, clearEvents } = useMonitorStream();
  const [running, setRunning] = useState(false);
  const [engineStatus, setEngineStatus] = useState<string>('idle');
  /** 自动发现的默认网关 */
  const [gateway, setGateway] = useState<string | null>(null);
  /** 历史记录水合: 打开页面时引擎已在运行的数据不会丢 */
  const [history, setHistory] = useState<{
    timeline: any[];
    impacts: any[];
    snapshots: any[];
    traceroutes: any[];
  }>({ timeline: [], impacts: [], snapshots: [], traceroutes: [] });
  const data = useLatestData(events);

  // 挂载时从 REST API 水合历史记录
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [timeline, impacts, snapshots, traceroutes] = await Promise.all([
          api.getTimeline().catch(() => []),
          api.getImpactRecords().catch(() => []),
          api.getSnapshots().catch(() => []),
          api.getTracerouteRecords().catch(() => []),
        ]);
        if (!cancelled) {
          setHistory({
            timeline: Array.isArray(timeline) ? timeline : [],
            impacts: Array.isArray(impacts) ? impacts : [],
            snapshots: Array.isArray(snapshots) ? snapshots : [],
            traceroutes: Array.isArray(traceroutes) ? traceroutes : [],
          });
        }
      } catch {
        // 引擎离线时静默失败, 面板保持空状态
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 定期检查引擎状态; 引擎已在运行时自动接入 SSE (刷新页面后不丢数据流)
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const state = await api.getStatus();
        setEngineStatus(state.status);
        setRunning(state.status === 'running');
        if (state.status === 'running') {
          connect();
        }
        // 网关发现状态随同轮询 (失败不影响主流程)
        api.getGateway().then((g) => {
          if (g?.gateway) setGateway(g.gateway);
        }).catch(() => {});
      } catch {
        setEngineStatus('offline');
      }
    };
    checkStatus();
    const timer = setInterval(checkStatus, 5000);
    return () => clearInterval(timer);
  }, [connect]);

  const handleStart = async () => {
    try {
      await api.startMonitor();
      connect();
      setRunning(true);
    } catch (e) {
      console.error('启动失败:', e);
    }
  };

  const handleStop = async () => {
    try {
      await api.stopMonitor();
      disconnect();
      setRunning(false);
    } catch (e) {
      console.error('停止失败:', e);
    }
  };

  // 合并历史记录与实时事件
  const mergedTimeline = useMemo(
    () => mergeById(history.timeline, data.timelineEvents),
    [history.timeline, data.timelineEvents]
  );
  const mergedImpacts = useMemo(
    () => mergeById(history.impacts, data.impacts),
    [history.impacts, data.impacts]
  );
  // 快照: SSE 最新快照优先, 否则取历史最后一条
  const latestSnapshot = data.snapshot ?? (history.snapshots.length > 0 ? history.snapshots[history.snapshots.length - 1] : null);
  // 路由追踪: SSE 最新结果优先, 否则取历史最后一条
  const latestTraceroute = data.tracerouteResult ?? (history.traceroutes.length > 0 ? history.traceroutes[history.traceroutes.length - 1] : null);

  // 提取延迟数据用于图表
  const latencyData = useMemo(() => {
    const map = new Map<string, { time: string; [key: string]: any }>();
    for (const event of events) {
      if (event.type === 'ping' && event.data?.latencyMs != null) {
        const time = new Date(event.data.timestamp).toLocaleTimeString();
        const key = event.data.host;
        if (!map.has(time)) {
          map.set(time, { time });
        }
        map.get(time)![event.data.target] = event.data.latencyMs;
      }
    }
    return Array.from(map.values()).slice(-60);
  }, [events]);

  return (
    <div className="dashboard">
      {/* 顶部标题 + 控制栏 */}
      <header className="dashboard-header">
        <div className="dashboard-title-group">
          <h1 className="dashboard-title">
            Campus Network Monitor
          </h1>
          <p className="dashboard-subtitle">
            校园网质量实时监控 · Ping / HTTP / DNS / Wi-Fi / 下载测速
          </p>
        </div>
        <ControlBar
          running={running}
          connected={connected}
          engineStatus={engineStatus}
          gateway={gateway}
          onStart={handleStart}
          onStop={handleStop}
        />
      </header>

      {/* 统计面板 */}
      <div className="stats-grid">
        <PingPanel results={data.pingResults} summary={data.summary?.ping} />
        <HttpPanel results={data.httpResults} summary={data.summary?.http} />
        <DnsPanel results={data.dnsResults} summary={data.summary?.dns} />
        <WifiPanel info={data.wifiInfo} summary={data.summary?.wifi} />
        <DownloadPanel result={data.downloadResult} summary={data.summary?.download} />
      </div>

      {/* 路由追踪诊断 (仅在触发时显示) */}
      {latestTraceroute && (
        <TraceroutePanel result={latestTraceroute} />
      )}

      {/* 异常快照 (仅在触发时显示) */}
      {latestSnapshot && (
        <SnapshotPanel snapshot={latestSnapshot} />
      )}

      {/* 异常时间轴 */}
      <TimelinePanel events={mergedTimeline} />

      {/* 业务影响记录 */}
      <ImpactPanel records={mergedImpacts} />

      {/* 延迟趋势图 */}
      <div className="section-panel">
        <div className="section-header">
          <h2 className="section-title">
            <span>📈</span> 延迟趋势
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>
              最近 60 次采样
            </span>
          </h2>
        </div>
        <LatencyChart data={latencyData} />
      </div>

      {/* 事件日志 */}
      <div className="section-panel">
        <div className="section-header">
          <h2 className="section-title">
            <span>📋</span> 事件日志
          </h2>
          <button
            onClick={clearEvents}
            className="btn btn-ghost btn-sm"
          >
            清空
          </button>
        </div>
        <EventLog events={events} anomalies={data.anomalies} />
      </div>
    </div>
  );
}
