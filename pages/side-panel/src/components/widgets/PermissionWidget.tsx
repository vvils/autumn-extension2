import { useState, memo, useCallback } from 'react';
import { Check, Send } from 'lucide-react';
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
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-[13px] font-medium text-gray-700">{question}</p>
        <div className="mt-2 flex items-center gap-1.5 text-[12px] text-emerald-600">
          <Check size={13} />
          <span>{displayedResponse}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="mb-1.5 text-[13px] font-medium text-gray-700">{question}</p>

      {context && (
        <div className="mb-2 text-[12px] text-gray-500">
          <MarkdownContent content={context} />
        </div>
      )}

      {options && options.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleOptionClick(opt.value)}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[12px] text-gray-700 transition-colors hover:border-accent hover:text-accent">
              {opt.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-1.5">
        <textarea
          value={textValue}
          onChange={e => setTextValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your response..."
          rows={1}
          className="flex-1 resize-none rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] text-gray-700 placeholder:text-gray-400 focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!textValue.trim()}
          className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50">
          <Send size={12} />
          Send
        </button>
      </div>
    </div>
  );
});
