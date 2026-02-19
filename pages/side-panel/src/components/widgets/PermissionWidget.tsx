import { useState, memo, useCallback } from 'react';
import { Check, ArrowUp } from 'lucide-react';
import type { PermissionWidgetData, WidgetRespondFn } from './types';
import MarkdownContent from '../MarkdownContent';

interface PermissionWidgetProps {
  widget: PermissionWidgetData;
  onRespond?: WidgetRespondFn;
}

export default memo(function PermissionWidget({ widget, onRespond }: PermissionWidgetProps) {
  const { question, context, options, answered: initialAnswered, response: initialResponse } = widget.data;
  const [answered, setAnswered] = useState(initialAnswered ?? false);
  const [textValue, setTextValue] = useState('');
  const displayedResponse = initialResponse ?? '';
  const hasOptions = options && options.length > 0;

  const submitResponse = useCallback(
    (value: string) => {
      if (!value.trim() || answered) return;
      setAnswered(true);
      onRespond?.(widget.widgetId, value.trim());
    },
    [answered, onRespond, widget.widgetId],
  );

  const handleOptionClick = useCallback(
    (value: string) => {
      submitResponse(value);
    },
    [submitResponse],
  );

  const handleSubmit = useCallback(() => {
    submitResponse(textValue);
  }, [submitResponse, textValue]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  if (answered) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
        <p className="text-[13px] font-medium text-gray-500">{question}</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-emerald-50">
            <Check size={12} className="text-emerald-600" />
          </span>
          <span className="text-[12px] font-medium text-emerald-700">{displayedResponse}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-accent-light bg-white p-4 shadow-[0_2px_12px_rgba(61,130,143,0.10)]">
      <p className="mb-1.5 text-[13px] font-semibold text-gray-900">{question}</p>

      {context && (
        <div className="mb-3 rounded-lg bg-accent-soft px-3 py-2 text-[12px] text-gray-600">
          <MarkdownContent content={context} />
        </div>
      )}

      {hasOptions ? (
        <div className="flex flex-wrap gap-1.5">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleOptionClick(opt.value)}
              className="rounded-full border border-accent-light bg-accent-soft px-3.5 py-1.5 text-[12px] font-medium text-accent-foreground transition-colors hover:border-accent-muted hover:bg-accent-light">
              {opt.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 transition-shadow focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/20">
          <div className="flex items-end gap-1.5 p-1.5">
            <textarea
              value={textValue}
              onChange={e => setTextValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your response..."
              rows={1}
              className="flex-1 resize-none bg-transparent px-2 py-1 text-[12px] text-gray-700 placeholder:text-gray-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!textValue.trim()}
              className="flex size-7 items-center justify-center rounded-lg bg-accent text-white transition-colors hover:opacity-90 disabled:opacity-40">
              <ArrowUp size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
