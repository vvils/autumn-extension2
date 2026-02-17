export interface HotelMetricsWidgetData {
  widgetId: string;
  type: 'data-hotel-metrics-data';
  data: {
    metrics: Array<{
      date: string;
      occupancy?: number;
      revenue?: number;
      adr?: number;
      revpar?: number;
      bookings?: number;
    }>;
    stlyMetrics?: Array<{
      date: string;
      occupancy?: number;
      revenue?: number;
      adr?: number;
      revpar?: number;
      bookings?: number;
    }>;
    summary: { metric: string; current: number; stly?: number; delta?: number; deltaPercent?: number };
    dateRange: { start: string; end: string };
  };
}

export interface SuggestionActionWidgetData {
  widgetId: string;
  type: 'data-suggestion-action';
  data: {
    id: string;
    title: string;
    description: string;
    currentValues: Record<string, unknown>;
    suggestedValues: Record<string, unknown>;
    apiCall: { endpoint: string; method: 'POST' | 'PATCH'; payload: Record<string, unknown> };
    metadata?: Record<string, unknown>;
  };
}

export type WidgetPayload = HotelMetricsWidgetData | SuggestionActionWidgetData;

export type WidgetApplyFn = (
  endpoint: string,
  method: string,
  payload: Record<string, unknown>,
) => Promise<{ success: boolean; error?: string }>;
