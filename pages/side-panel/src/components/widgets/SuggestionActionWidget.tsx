import { useState, memo, useCallback } from 'react';
import { Check, X, Loader2, Lightbulb } from 'lucide-react';
import type { SuggestionActionWidgetData, WidgetApplyFn } from './types';

type WidgetState = 'idle' | 'applying' | 'success' | 'error' | 'dismissed';

interface SuggestionActionWidgetProps {
  widget: SuggestionActionWidgetData;
  onApply?: WidgetApplyFn;
}

export default memo(function SuggestionActionWidget({ widget, onApply }: SuggestionActionWidgetProps) {
  const { title, description, currentValues, suggestedValues, apiCall } = widget.data;
  const [state, setState] = useState<WidgetState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleApply = useCallback(async () => {
    if (!onApply) return;
    setState('applying');
    setErrorMessage('');
    const result = await onApply(apiCall.endpoint, apiCall.method, apiCall.payload);
    if (result.success) {
      setState('success');
      setTimeout(() => setState('dismissed'), 3000);
    } else {
      setState('error');
      setErrorMessage(result.error ?? 'Unknown error');
    }
  }, [onApply, apiCall]);

  if (state === 'dismissed') {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-400">
        <span className="italic">Suggestion dismissed</span>
      </div>
    );
  }

  const valueKeys = Array.from(new Set([...Object.keys(currentValues), ...Object.keys(suggestedValues)]));

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Lightbulb size={13} className="shrink-0 text-amber-500" />
        <span className="text-[12px] font-medium text-gray-700">{title}</span>
      </div>

      {description && <p className="mb-2 text-[11px] leading-relaxed text-gray-500">{description}</p>}

      {valueKeys.length > 0 && (
        <table className="mb-2 w-full text-[10px]">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-0.5 text-left font-medium text-gray-500">Field</th>
              <th className="py-0.5 text-left font-medium text-gray-500">Current</th>
              <th className="py-0.5 text-left font-medium text-gray-500">Suggested</th>
            </tr>
          </thead>
          <tbody>
            {valueKeys.map(key => (
              <tr key={key} className="border-b border-gray-100">
                <td className="py-0.5 text-gray-600">{key}</td>
                <td className="py-0.5 text-gray-500">{String(currentValues[key] ?? '—')}</td>
                <td className="py-0.5 font-medium text-gray-700">{String(suggestedValues[key] ?? '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {state === 'error' && (
        <div className="mb-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-600">{errorMessage}</div>
      )}

      {state === 'success' ? (
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-600">
          <Check size={13} />
          <span>Applied successfully</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleApply}
            disabled={state === 'applying' || !onApply}
            className="flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50">
            {state === 'applying' ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Applying…
              </>
            ) : state === 'error' ? (
              'Retry'
            ) : (
              'Apply'
            )}
          </button>
          {state !== 'applying' && (
            <button
              type="button"
              onClick={() => setState('dismissed')}
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-gray-500 transition-colors hover:bg-gray-100">
              <X size={12} />
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
});
