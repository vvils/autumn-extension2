import { memo } from 'react';
import type { WidgetPayload, WidgetApplyFn, WidgetRespondFn } from './types';
import HotelMetricsWidget from './HotelMetricsWidget';
import SuggestionActionWidget from './SuggestionActionWidget';
import PermissionWidget from './PermissionWidget';

interface WidgetRendererProps {
  widget: WidgetPayload;
  onApply?: WidgetApplyFn;
  onRespond?: WidgetRespondFn;
}

export default memo(function WidgetRenderer({ widget, onApply, onRespond }: WidgetRendererProps) {
  switch (widget.type) {
    case 'data-hotel-metrics-data':
      return <HotelMetricsWidget widget={widget} />;
    case 'data-suggestion-action':
      return <SuggestionActionWidget widget={widget} onApply={onApply} />;
    case 'permission-request':
      return <PermissionWidget widget={widget} onRespond={onRespond} />;
    default:
      return null;
  }
});
