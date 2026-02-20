import { useState, memo, useCallback } from 'react';
import { Check, ArrowUp, SquareCheckBig, ChevronRight } from 'lucide-react';
import type { PermissionWidgetData, WidgetRespondFn } from './types';
import MarkdownContent from '../MarkdownContent';

interface PermissionWidgetProps {
  widget: PermissionWidgetData;
  onRespond?: WidgetRespondFn;
}

export default memo(function PermissionWidget({ widget, onRespond }: PermissionWidgetProps) {
  const { question, context, htmlContent, options, answered: initialAnswered, response: initialResponse } = widget.data;
  const [answered, setAnswered] = useState(initialAnswered ?? false);
  const [expanded, setExpanded] = useState(!(initialAnswered ?? false));
  const [textValue, setTextValue] = useState('');
  const [answerLabel, setAnswerLabel] = useState(() => {
    if (!initialResponse) return '';
    const match = options?.find(o => o.value === initialResponse);
    return match?.label ?? initialResponse;
  });
  const hasOptions = options && options.length > 0;

  const submitResponse = useCallback(
    (value: string) => {
      if (!value.trim() || answered) return;
      setAnswered(true);
      setExpanded(false);
      onRespond?.(widget.widgetId, value.trim());
    },
    [answered, onRespond, widget.widgetId],
  );

  const handleOptionClick = useCallback(
    (value: string, label: string) => {
      setAnswerLabel(label);
      submitResponse(value);
    },
    [submitResponse],
  );

  const handleSubmit = useCallback(() => {
    setAnswerLabel(textValue.trim());
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

  return (
    <div className="rounded-[14px] overflow-hidden border border-black/10 bg-white shadow-[0_2px_4px_0_rgba(0,0,0,0.03),0_1px_0_0_rgba(255,255,255,0.60)_inset]">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="flex w-full items-center gap-2.5 px-4 py-[10px] transition-colors hover:bg-black/[0.02]">
        <SquareCheckBig size={16} className="shrink-0 text-black" />
        <span className="flex-1 truncate text-left text-[14px] text-black">{question}</span>
        {answered && !expanded && answerLabel && (
          <span className="max-w-[160px] shrink-0 truncate rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
            Answer: {answerLabel}
          </span>
        )}
        <ChevronRight
          size={14}
          className={`shrink-0 text-neutral-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
        />
      </button>

      {/* Collapsible content */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}>
        <div className="overflow-hidden">
          <div className="border-t border-black/5" />

          <div className="px-4 py-3">
            <div className="mb-2 text-sm leading-relaxed text-neutral-800">
              <MarkdownContent content={question} />
            </div>

            {context && (
              <div className="mb-3 rounded-xl bg-neutral-50 px-3 py-2 text-[12px] text-neutral-600">
                <MarkdownContent content={context} />
              </div>
            )}

            {htmlContent && (
              <div className="mb-3 overflow-hidden rounded-xl border border-black/5">
                <iframe srcDoc={htmlContent} sandbox="" title="Email preview" className="h-[400px] w-full" />
              </div>
            )}

            {answered && answerLabel && (
              <div className="mt-2 flex items-center gap-2">
                <Check size={14} className="shrink-0 text-black" />
                <span className="text-[13px] font-medium text-black/75">Answer: {answerLabel}</span>
              </div>
            )}
          </div>

          {/* Option buttons */}
          {!answered && hasOptions && (
            <div className="flex flex-wrap gap-2 px-4 pb-4 pt-1 select-none">
              {options.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleOptionClick(opt.value, opt.label)}
                  className="h-[32px] rounded-[16px] border border-black/15 bg-white px-4 text-[13px] font-medium text-black/75 shadow-[0px_1.2px_3.6px_rgba(0,0,0,0.06)] transition-colors hover:bg-black/5 active:scale-[0.97]">
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Textarea fallback */}
          {!answered && !hasOptions && (
            <div className="px-4 pb-4 pt-1">
              <div className="rounded-xl border border-black/10 bg-white transition-shadow focus-within:border-black/20 focus-within:ring-2 focus-within:ring-black/5">
                <div className="flex items-end gap-1.5 p-1.5">
                  <textarea
                    value={textValue}
                    onChange={e => setTextValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your response..."
                    rows={1}
                    className="flex-1 resize-none bg-transparent px-2 py-1 text-[12px] text-neutral-700 placeholder:text-neutral-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!textValue.trim()}
                    className="flex size-7 items-center justify-center rounded-lg bg-black text-white transition-colors hover:bg-black/90 disabled:opacity-40">
                    <ArrowUp size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
