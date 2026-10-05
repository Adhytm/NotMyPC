/**
 * LatencyChart - 实时延迟折线图
 */

'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

const COLORS = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#a855f7'];

interface LatencyChartProps {
  data: Array<{ time: string; [key: string]: any }>;
}

export default function LatencyChart({ data }: LatencyChartProps) {
  if (data.length === 0) {
    return (
      <div className="empty-state">
        等待 Ping 数据...
      </div>
    );
  }

  const targets = Array.from(
    new Set(data.flatMap((d) => Object.keys(d).filter((k) => k !== 'time')))
  );

  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="time"
            stroke="var(--text-muted)"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
          />
          <YAxis
            stroke="var(--text-muted)"
            fontSize={11}
            unit="ms"
            tickLine={false}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-default)',
              borderRadius: 8,
              fontSize: 12,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
            labelStyle={{ color: 'var(--text-primary)', fontWeight: 600 }}
            itemStyle={{ color: 'var(--text-secondary)' }}
          />
          {targets.map((target, i) => (
            <Line
              key={target}
              type="monotone"
              dataKey={target}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
