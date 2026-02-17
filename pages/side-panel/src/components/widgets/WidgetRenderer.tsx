import { memo } from 'react';
import type { WidgetPayload, WidgetApplyFn } from './types';
import HotelMetricsWidget from './HotelMetricsWidget';
import SuggestionActionWidget from './SuggestionActionWidget';

interface WidgetRendererProps {
  widget: WidgetPayload;
  onApply?: WidgetApplyFn;
}

export default memo(function WidgetRenderer({ widget, onApply }: WidgetRendererProps) {
  switch (widget.type) {
    case 'data-hotel-metrics-data':
      return <HotelMetricsWidget widget={widget} />;
    case 'data-suggestion-action':
      return <SuggestionActionWidget widget={widget} onApply={onApply} />;
    default:
      return null;
  }
});
