import { useState, memo, useCallback } from 'react';
import { Check, ArrowUp } from 'lucide-react';
import type { PermissionWidgetData, WidgetRespondFn } from './types';
import MarkdownContent from '../MarkdownContent';

interface PermissionWidgetProps {
  widget: PermissionWidgetData;
  onRespond?: WidgetRespondFn;
}

export default memo(function PermissionWidget({ widget, onRespond }: PermissionWidgetProps) {
  const { question, context, htmlContent, options, answered: initialAnswered, response: initialResponse } = widget.data;
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
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 px-4 py-3">
        <div className="text-[13px] font-medium text-gray-500">
          <MarkdownContent content={question} />
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <Check size={12} className="text-emerald-600" />
          </span>
          <span className="text-[12px] font-medium text-emerald-700">{displayedResponse}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-accent-light/60 bg-accent-soft/40 p-4 shadow-sm">
      <div className="mb-2 text-[13px] font-semibold text-gray-800">
        <MarkdownContent content={question} />
      </div>

      {context && (
        <div className="mb-3 rounded-xl bg-white/70 px-3 py-2 text-[12px] text-gray-600">
          <MarkdownContent content={context} />
        </div>
      )}

      {htmlContent && (
        <div className="mb-3 overflow-hidden rounded-xl border border-gray-200/60">
          <iframe srcDoc={htmlContent} sandbox="" title="Email preview" className="h-[400px] w-full" />
        </div>
      )}

      {hasOptions ? (
        <div className="flex flex-wrap gap-1.5">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleOptionClick(opt.value)}
              className="rounded-full border border-accent-light bg-white px-3.5 py-1.5 text-[12px] font-medium text-accent-foreground shadow-sm transition-all hover:border-accent-muted hover:bg-accent-light hover:shadow-none active:scale-[0.97]">
              {opt.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-accent-light/50 bg-white transition-shadow focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/15">
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
