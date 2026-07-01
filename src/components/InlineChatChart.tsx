import React, { useId } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { AlertTriangle, BarChart3, LineChart as LineIcon, PieChart as PieIcon, AreaChart as AreaIcon } from 'lucide-react';
import { InlineChartSpec } from '../types';

interface InlineChatChartProps {
  spec: InlineChartSpec;
  compact?: boolean;
}

const COLORS = [
  '#6366f1', // Indigo
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#ef4444', // Red
];

// Custom Tooltip for dark theme
const DarkCustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-950/95 p-2.5 shadow-xl backdrop-blur-md">
        {label !== undefined && label !== null && (
          <p className="mb-1 font-mono text-[10px] font-semibold text-slate-400">
            {String(label)}
          </p>
        )}
        <div className="space-y-1">
          {payload.map((entry: any, index: number) => {
            const numVal = Number(entry.value);
            const formattedVal = isNaN(numVal) 
              ? entry.value 
              : numVal.toLocaleString(undefined, { maximumFractionDigits: 2 });
            return (
              <div key={index} className="flex items-center gap-2 text-xs font-sans">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-slate-300 font-medium">{entry.name}:</span>
                <span className="text-slate-100 font-bold ml-auto">{formattedVal}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
};

export function InlineChatChart({ spec, compact = false }: InlineChatChartProps) {
  const gradientId = useId();
  const { title, chartType, xKey, yKeys, data, insight, sourceOfTruth } = spec;

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 border border-slate-800 rounded-xl bg-slate-900/40 text-slate-500 text-xs">
        <AlertTriangle className="w-5 h-5 text-slate-600 mb-2" />
        <span>No chart data available</span>
      </div>
    );
  }

  const renderChartContent = () => {
    switch (chartType) {
      case 'bar':
        return (
          <BarChart data={data} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis 
              dataKey={xKey} 
              stroke="#64748b" 
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              stroke="#64748b" 
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => Number(v).toLocaleString(undefined, { notation: 'compact', compactDisplay: 'short' })}
            />
            <Tooltip content={<DarkCustomTooltip />} />
            {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />}
            {yKeys.map((key, idx) => (
              <Bar 
                key={key} 
                dataKey={key} 
                fill={COLORS[idx % COLORS.length]} 
                radius={[4, 4, 0, 0]} 
              />
            ))}
          </BarChart>
        );

      case 'line':
        return (
          <LineChart data={data} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis 
              dataKey={xKey} 
              stroke="#64748b" 
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              stroke="#64748b" 
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => Number(v).toLocaleString(undefined, { notation: 'compact', compactDisplay: 'short' })}
            />
            <Tooltip content={<DarkCustomTooltip />} />
            {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />}
            {yKeys.map((key, idx) => (
              <Line 
                key={key} 
                type="monotone" 
                dataKey={key} 
                stroke={COLORS[idx % COLORS.length]} 
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 1 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        );

      case 'area':
        return (
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
            <defs>
              {yKeys.map((key, idx) => {
                const color = COLORS[idx % COLORS.length];
                return (
                  <linearGradient key={key} id={`${gradientId}-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.4}/>
                    <stop offset="95%" stopColor={color} stopOpacity={0}/>
                  </linearGradient>
                );
              })}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis 
              dataKey={xKey} 
              stroke="#64748b" 
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              stroke="#64748b" 
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => Number(v).toLocaleString(undefined, { notation: 'compact', compactDisplay: 'short' })}
            />
            <Tooltip content={<DarkCustomTooltip />} />
            {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />}
            {yKeys.map((key, idx) => (
              <Area 
                key={key} 
                type="monotone" 
                dataKey={key} 
                stroke={COLORS[idx % COLORS.length]} 
                fillOpacity={1} 
                fill={`url(#${gradientId}-${key})`} 
                strokeWidth={1.5}
              />
            ))}
          </AreaChart>
        );

      case 'pie':
        // Pie usually uses a single key but has different values per category
        const valueKey = yKeys[0] || 'value';
        return (
          <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
            <Tooltip content={<DarkCustomTooltip />} />
            <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
            <Pie
              data={data}
              dataKey={valueKey}
              nameKey={xKey}
              cx="50%"
              cy="42%"
              innerRadius={35}
              outerRadius={55}
              paddingAngle={2}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        );

      default:
        return null;
    }
  };

  const IconComponent = {
    bar: BarChart3,
    line: LineIcon,
    pie: PieIcon,
    area: AreaIcon
  }[chartType] || BarChart3;

  return (
    <div className="w-full mt-2.5 overflow-hidden rounded-xl bg-slate-950/80 border border-slate-800 p-3 shadow-inner flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
        <div className="flex items-center gap-1.5">
          <IconComponent className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <h6 className="text-[11px] font-sans font-bold text-slate-200 tracking-wide truncate max-w-[200px] sm:max-w-[320px]">
            {title}
          </h6>
        </div>
        
        {sourceOfTruth === 'screenshot_ocr' ? (
          <div className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono scale-90">
            <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
            <span>Screenshot OCR</span>
          </div>
        ) : (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/25 text-indigo-300 font-mono scale-90">
            Live Grounded
          </span>
        )}
      </div>

      <div className="w-full h-[180px] shrink-0 font-sans">
        <ResponsiveContainer width="100%" height="100%">
          {renderChartContent()}
        </ResponsiveContainer>
      </div>

      {insight && (
        <div className="text-[10px] text-slate-400 font-sans border-t border-slate-800 pt-1.5 leading-relaxed bg-slate-950/30 px-1 py-0.5 rounded-sm">
          <span className="font-semibold text-slate-300 uppercase tracking-wider mr-1">Takeaway:</span>
          {insight}
        </div>
      )}
    </div>
  );
}
