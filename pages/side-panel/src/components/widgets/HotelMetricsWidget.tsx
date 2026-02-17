import { useState, useMemo, useRef, useEffect, memo } from 'react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { BarChart3, ToggleLeft, ToggleRight, ChevronDown, Check } from 'lucide-react';
import type { HotelMetricsWidgetData } from './types';

type MetricKey = 'occupancy' | 'revenue' | 'adr' | 'revpar' | 'bookings';
type DataType = 'percentage' | 'currency' | 'integer';

const METRIC_OPTIONS: { key: MetricKey; label: string; dataType: DataType; format: (v: number) => string }[] = [
  { key: 'occupancy', label: 'Occupancy', dataType: 'percentage', format: v => `${v.toFixed(1)}%` },
  { key: 'revenue', label: 'Revenue', dataType: 'currency', format: v => `$${v.toLocaleString()}` },
  { key: 'adr', label: 'ADR', dataType: 'currency', format: v => `$${v.toFixed(2)}` },
  { key: 'revpar', label: 'RevPAR', dataType: 'currency', format: v => `$${v.toFixed(2)}` },
  { key: 'bookings', label: 'Bookings', dataType: 'integer', format: v => String(v) },
];

const CHART_COLORS = {
  current: '#3d828f',
  currentLight: '#70b5c2',
  stly: '#ce788e',
  stlyLight: '#d4879a',
  grid: '#E5E7EB',
  text: '#6B7280',
  border: '#E5E7EB',
};

interface RawBackendPayload {
  current: {
    timeSeries: Array<{ date: string; metrics: Record<string, number> }>;
    summary?: Record<string, number>;
  };
  stly?: {
    enabled: boolean;
    timeSeries?: Array<{ date: string; metrics: Record<string, number> }>;
    summary?: Record<string, number>;
  };
  comparison?: { summary?: Record<string, number> };
  timeDimension: { startDate: string; endDate: string };
  displayHints?: { defaultMetric?: string; suggestedChartType?: string };
}

type NormalizedData = HotelMetricsWidgetData['data'] & { suggestedChartType?: string };

function normalizeData(raw: unknown): NormalizedData {
  if (Array.isArray((raw as NormalizedData)?.metrics)) return raw as NormalizedData;

  const p = raw as RawBackendPayload;
  const defaultMetric = (p.displayHints?.defaultMetric ?? 'occupancy') as MetricKey;

  const metrics = p.current.timeSeries.map(ts => ({ date: ts.date, ...ts.metrics }));
  const stlyMetrics =
    p.stly?.enabled && p.stly.timeSeries ? p.stly.timeSeries.map(ts => ({ date: ts.date, ...ts.metrics })) : undefined;

  const currentVal = p.current.summary?.[defaultMetric] ?? 0;
  const stlyVal = p.stly?.enabled ? p.stly.summary?.[defaultMetric] : undefined;
  const delta = stlyVal !== undefined ? currentVal - stlyVal : undefined;

  const comp = p.comparison?.summary;
  const deltaPercent = comp?.[`${defaultMetric}Change`] ?? comp?.[`${defaultMetric}Growth`];

  return {
    metrics,
    stlyMetrics,
    summary: { metric: defaultMetric, current: currentVal, stly: stlyVal, delta, deltaPercent },
    dateRange: { start: p.timeDimension.startDate, end: p.timeDimension.endDate },
    suggestedChartType: p.displayHints?.suggestedChartType,
  };
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}

function formatDateDisplay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(m)}/${parseInt(d)}/${y}`;
}

interface ChartRow {
  fullDate: string;
  stlyDate?: string;
  dayLabel: string;
  current: number;
  stly?: number;
}

interface HotelMetricsWidgetProps {
  widget: HotelMetricsWidgetData;
}

export default memo(function HotelMetricsWidget({ widget }: HotelMetricsWidgetProps) {
  const normalized = normalizeData(widget.data);
  const { metrics, stlyMetrics, summary, dateRange } = normalized;
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>((summary.metric as MetricKey) || 'occupancy');
  const [showStly, setShowStly] = useState(!!stlyMetrics?.length);
  const [showMetricMenu, setShowMetricMenu] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const metricConfig = METRIC_OPTIONS.find(m => m.key === selectedMetric) ?? METRIC_OPTIONS[0];
  const useLineChart = normalized.suggestedChartType === 'line';

  useEffect(() => {
    if (!showMetricMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowMetricMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMetricMenu]);

  const hasStlyData = !!stlyMetrics?.length;

  const chartData = useMemo<ChartRow[]>(
    () =>
      metrics.map((m, i) => ({
        fullDate: m.date,
        stlyDate: stlyMetrics?.[i]?.date,
        dayLabel: getDayLabel(m.date),
        current: (m[selectedMetric] as number) ?? 0,
        stly: hasStlyData ? ((stlyMetrics?.[i]?.[selectedMetric] as number) ?? 0) : undefined,
      })),
    [metrics, stlyMetrics, selectedMetric, hasStlyData],
  );

  const reactiveSummary = useMemo(() => {
    const raw = widget.data as unknown as RawBackendPayload;
    if (raw.current?.summary) {
      const current = raw.current.summary[selectedMetric] ?? 0;
      const stly = raw.stly?.enabled ? raw.stly.summary?.[selectedMetric] : undefined;
      const comp = raw.comparison?.summary;
      const deltaPercent = comp?.[`${selectedMetric}Change`] ?? comp?.[`${selectedMetric}Growth`];
      return { current, stly, deltaPercent };
    }
    return { current: summary.current, stly: summary.stly, deltaPercent: summary.deltaPercent };
  }, [widget.data, selectedMetric, summary]);

  const formatYAxis = (value: number) => {
    if (metricConfig.dataType === 'percentage') return `${value.toFixed(0)}%`;
    if (metricConfig.dataType === 'currency') {
      return value >= 1000 ? `$${(value / 1000).toFixed(0)}K` : `$${value.toFixed(0)}`;
    }
    return value.toFixed(0);
  };

  const yAxisDomain: [number, number | 'auto'] = metricConfig.dataType === 'percentage' ? [0, 100] : [0, 'auto'];

  interface TooltipPayload {
    payload: ChartRow;
    value: number;
    color: string;
    name: string;
  }

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) => {
    if (!active || !payload?.length) return null;
    const point = payload[0].payload;
    const indicatorShape = useLineChart ? 'rounded-full' : 'rounded-sm';

    return (
      <div className="rounded-md border border-gray-200 bg-white p-3 shadow-lg">
        <div className="mb-2 text-xs font-semibold text-gray-900">
          {point.dayLabel}, {formatDateDisplay(point.fullDate)}
        </div>
        {payload.map((entry, i) => {
          if (entry.value == null) return null;
          return (
            <div key={i} className="mb-1 flex items-center gap-2">
              <div className={`h-3 w-3 ${indicatorShape}`} style={{ backgroundColor: entry.color }} />
              <span className="text-xs text-gray-500">{entry.name}:</span>
              <span className="text-xs font-medium text-gray-900">{metricConfig.format(entry.value)}</span>
            </div>
          );
        })}
        {point.stly != null && point.current != null && (
          <div className="mt-1 border-t border-gray-100 pt-1 text-xs text-gray-400">
            Change: {metricConfig.format(point.current - (point.stly ?? 0))}
          </div>
        )}
      </div>
    );
  };

  const CustomLegend = () => {
    const indicatorShape = useLineChart ? 'rounded-full' : 'rounded-sm';
    return (
      <div className="mt-2 flex items-center justify-center gap-4">
        {showStly && (
          <div className="flex items-center gap-1.5">
            <div className={`h-2.5 w-2.5 ${indicatorShape}`} style={{ backgroundColor: CHART_COLORS.stly }} />
            <span className="text-[11px] font-medium text-gray-700">STLY</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <div className={`h-2.5 w-2.5 ${indicatorShape}`} style={{ backgroundColor: CHART_COLORS.current }} />
          <span className="text-[11px] font-medium text-gray-700">Current</span>
        </div>
      </div>
    );
  };

  const renderDelta = () => {
    const delta = reactiveSummary.deltaPercent;
    if (delta === undefined) return null;

    const arrow = delta > 0 ? '\u2191' : delta < 0 ? '\u2193' : '';
    const sign = delta > 0 ? '+' : '';
    const color = delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-400';

    let formatted: string;
    if (metricConfig.dataType === 'percentage') {
      const abs = Math.abs(delta);
      formatted = (abs < 1 && abs > 0 ? abs.toFixed(1) : Math.round(abs).toString()) + '%';
    } else {
      formatted = metricConfig.format(Math.abs(delta));
    }

    return (
      <>
        <span className="text-gray-300">|</span>
        <span className="text-gray-500">Change:</span>
        <span className={`font-semibold ${color}`}>
          {arrow}
          {sign}
          {formatted}
        </span>
      </>
    );
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BarChart3 size={13} className="text-gray-400" />
          <span className="text-[11px] font-medium text-gray-600">Hotel Metrics</span>
        </div>
        {hasStlyData && (
          <button
            type="button"
            onClick={() => setShowStly(prev => !prev)}
            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700">
            {showStly ? <ToggleRight size={14} className="text-[#3d828f]" /> : <ToggleLeft size={14} />}
            vs STLY
          </button>
        )}
      </div>

      {/* Metric dropdown */}
      <div className="relative mb-2" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setShowMetricMenu(prev => !prev)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
          {metricConfig.label}
          <ChevronDown size={12} className={`transition-transform ${showMetricMenu ? 'rotate-180' : ''}`} />
        </button>
        {showMetricMenu && (
          <div className="absolute left-0 z-50 mt-1 w-[140px] rounded-lg border border-gray-200 bg-white p-1.5 shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
            {METRIC_OPTIONS.map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  setSelectedMetric(opt.key);
                  setShowMetricMenu(false);
                }}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-gray-50">
                <span className="text-sm font-medium text-gray-700">{opt.label}</span>
                {selectedMetric === opt.key && <Check size={12} className="text-[#3d828f]" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Summary stats */}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        {reactiveSummary.stly !== undefined && (
          <>
            <span className="text-gray-500">STLY:</span>
            <span className="font-semibold text-gray-900">{metricConfig.format(reactiveSummary.stly)}</span>
            <span className="text-gray-300">|</span>
          </>
        )}
        <span className="text-gray-500">Current:</span>
        <span className="font-semibold text-gray-900">{metricConfig.format(reactiveSummary.current)}</span>
        {renderDelta()}
      </div>

      {/* Chart */}
      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          {useLineChart ? (
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis
                dataKey="fullDate"
                tickFormatter={getDayLabel}
                tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
                stroke={CHART_COLORS.border}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatYAxis}
                tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
                stroke={CHART_COLORS.border}
                domain={yAxisDomain}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: CHART_COLORS.grid, strokeWidth: 1 }} />
              {showStly && (
                <Line
                  type="monotone"
                  dataKey="stly"
                  stroke={CHART_COLORS.stly}
                  strokeWidth={2}
                  dot={{ fill: CHART_COLORS.stly, r: 3 }}
                  activeDot={{ r: 5, fill: CHART_COLORS.stlyLight }}
                  name="STLY"
                  connectNulls
                />
              )}
              <Line
                type="monotone"
                dataKey="current"
                stroke={CHART_COLORS.current}
                strokeWidth={2}
                dot={{ fill: CHART_COLORS.current, r: 3 }}
                activeDot={{ r: 5, fill: CHART_COLORS.currentLight }}
                name="Current"
                connectNulls
              />
            </LineChart>
          ) : (
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <pattern
                  id="currentStripes"
                  patternUnits="userSpaceOnUse"
                  width="4"
                  height="4"
                  patternTransform="rotate(45)">
                  <rect width="4" height="4" fill={CHART_COLORS.current} />
                  <line x1="0" y1="0" x2="0" y2="4" stroke={CHART_COLORS.currentLight} strokeWidth="3" />
                </pattern>
                <pattern
                  id="stlyStripes"
                  patternUnits="userSpaceOnUse"
                  width="4"
                  height="4"
                  patternTransform="rotate(45)">
                  <rect width="4" height="4" fill={CHART_COLORS.stly} />
                  <line x1="0" y1="0" x2="0" y2="4" stroke={CHART_COLORS.stlyLight} strokeWidth="3" />
                </pattern>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis
                dataKey="fullDate"
                tickFormatter={getDayLabel}
                tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
                stroke={CHART_COLORS.border}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatYAxis}
                tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
                stroke={CHART_COLORS.border}
                domain={yAxisDomain}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
              {showStly && <Bar dataKey="stly" fill="url(#stlyStripes)" name="STLY" radius={[4, 4, 0, 0]} />}
              <Bar dataKey="current" fill="url(#currentStripes)" name="Current" radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <CustomLegend />

      {/* Footer */}
      <div className="mt-1.5 border-t border-gray-100 pt-1.5 text-[10px] text-gray-400">
        {formatDateDisplay(dateRange.start)} to {formatDateDisplay(dateRange.end)}
      </div>
    </div>
  );
});
