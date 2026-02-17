import { useState, memo } from 'react';
import { BarChart3, ToggleLeft, ToggleRight } from 'lucide-react';
import type { HotelMetricsWidgetData } from './types';

type MetricKey = 'occupancy' | 'revenue' | 'adr' | 'revpar' | 'bookings';

const METRIC_OPTIONS: { key: MetricKey; label: string; format: (v: number) => string }[] = [
  { key: 'occupancy', label: 'Occupancy', format: v => `${v.toFixed(1)}%` },
  { key: 'revenue', label: 'Revenue', format: v => `$${v.toLocaleString()}` },
  { key: 'adr', label: 'ADR', format: v => `$${v.toFixed(2)}` },
  { key: 'revpar', label: 'RevPAR', format: v => `$${v.toFixed(2)}` },
  { key: 'bookings', label: 'Bookings', format: v => String(v) },
];

interface HotelMetricsWidgetProps {
  widget: HotelMetricsWidgetData;
}

export default memo(function HotelMetricsWidget({ widget }: HotelMetricsWidgetProps) {
  const { metrics, stlyMetrics, summary, dateRange } = widget.data;
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>((summary.metric as MetricKey) || 'occupancy');
  const [showStly, setShowStly] = useState(false);

  const metricConfig = METRIC_OPTIONS.find(m => m.key === selectedMetric) ?? METRIC_OPTIONS[0];
  const values = metrics.map(m => m[selectedMetric] ?? 0);
  const stlyValues = stlyMetrics?.map(m => m[selectedMetric] ?? 0) ?? [];
  const maxValue = Math.max(...values, ...(showStly ? stlyValues : []), 1);

  const deltaColor = summary.delta !== undefined && summary.delta >= 0 ? 'text-emerald-600' : 'text-red-500';

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BarChart3 size={13} className="text-gray-400" />
          <span className="text-[11px] font-medium text-gray-600">Hotel Metrics</span>
        </div>
        <span className="text-[10px] text-gray-400">
          {dateRange.start} — {dateRange.end}
        </span>
      </div>

      <div className="mb-2 flex items-center gap-1.5">
        <select
          value={selectedMetric}
          onChange={e => setSelectedMetric(e.target.value as MetricKey)}
          className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] text-gray-700 outline-none">
          {METRIC_OPTIONS.map(opt => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
        {stlyMetrics && stlyMetrics.length > 0 && (
          <button
            type="button"
            onClick={() => setShowStly(prev => !prev)}
            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700">
            {showStly ? <ToggleRight size={14} className="text-accent" /> : <ToggleLeft size={14} />}
            STLY
          </button>
        )}
      </div>

      <div className="mb-2 flex items-center gap-3 text-[11px]">
        <span className="text-gray-600">
          Current: <span className="font-semibold">{metricConfig.format(summary.current)}</span>
        </span>
        {summary.stly !== undefined && <span className="text-gray-500">STLY: {metricConfig.format(summary.stly)}</span>}
        {summary.delta !== undefined && (
          <span className={deltaColor}>
            {summary.delta >= 0 ? '+' : ''}
            {metricConfig.format(summary.delta)}
            {summary.deltaPercent !== undefined && (
              <span className="ml-0.5">
                ({summary.deltaPercent >= 0 ? '+' : ''}
                {summary.deltaPercent.toFixed(1)}%)
              </span>
            )}
          </span>
        )}
      </div>

      <div className="space-y-1">
        {metrics.map((m, i) => {
          const val = m[selectedMetric] ?? 0;
          const pct = (val / maxValue) * 100;
          const stlyVal = showStly ? (stlyMetrics?.[i]?.[selectedMetric] ?? 0) : 0;
          const stlyPct = showStly ? (stlyVal / maxValue) * 100 : 0;
          const label = m.date.length > 5 ? m.date.slice(5) : m.date;
          return (
            <div key={m.date} className="flex items-center gap-1.5 text-[10px]">
              <span className="w-10 shrink-0 text-right text-gray-500">{label}</span>
              <div className="relative h-3 flex-1 overflow-hidden rounded bg-gray-200">
                {showStly && (
                  <div className="absolute inset-y-0 left-0 rounded bg-gray-300" style={{ width: `${stlyPct}%` }} />
                )}
                <div className="absolute inset-y-0 left-0 rounded bg-accent" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-12 shrink-0 text-right text-gray-500">{metricConfig.format(val)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
