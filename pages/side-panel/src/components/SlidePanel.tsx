import { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

interface SlidePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: 'left' | 'right';
  children: React.ReactNode;
}

export function SlidePanel({ open, onClose, title, side = 'right', children }: SlidePanelProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, handleEscape]);

  const isRight = side === 'right';
  const translateOpen = 'translate-x-0';
  const translateClosed = isRight ? 'translate-x-full' : '-translate-x-full';
  const rounded = isRight ? 'rounded-l-[20px]' : 'rounded-r-[20px]';
  const position = isRight ? 'right-0' : 'left-0';

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity duration-200 ease-out ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      aria-hidden={!open}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`absolute top-0 ${position} flex size-full max-w-sm flex-col bg-white shadow-[0_4px_20px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.06)] duration-200 ease-out ${rounded} transition-transform ${open ? translateOpen : translateClosed}`}>
        <div className="flex shrink-0 items-center justify-between px-5 py-4">
          <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
