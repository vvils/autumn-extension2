import { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

interface QuickActionModalProps {
  open: boolean;
  onClose: () => void;
  quickAction: { name: string; description: string; prompt: string } | null;
  onRun: () => void;
}

export function QuickActionModal({ open, onClose, quickAction, onRun }: QuickActionModalProps) {
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

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity duration-200 ease-out ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      aria-hidden={!open}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />

      <div
        className={`absolute inset-x-0 bottom-0 flex max-h-[70%] flex-col rounded-t-[20px] bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.08)] transition-transform duration-200 ease-out ${open ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="flex shrink-0 items-center justify-between px-4 py-3">
          <h2 className="text-[15px] font-semibold text-gray-900">Quick Action</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-[20px]">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-gray-700">Name</label>
            <div className="rounded-lg bg-[#f4f4f4] px-3 py-2 text-[13px] text-gray-900">{quickAction?.name}</div>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-gray-700">Description</label>
            <textarea
              readOnly
              rows={8}
              value={quickAction?.description ?? ''}
              className="w-full resize-none rounded-lg border-0 bg-[#f4f4f4] px-3 py-2 text-[13px] leading-relaxed text-gray-900 outline-none"
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border-0 bg-neutral-200 px-3.5 py-2 text-[13px] font-medium text-black/70 transition-colors hover:bg-neutral-300">
            Cancel
          </button>
          <button
            type="button"
            onClick={onRun}
            className="bg-accent hover:bg-accent-hover rounded-lg px-3.5 py-2 text-[13px] font-medium text-white transition-colors">
            Run
          </button>
        </div>
      </div>
    </div>
  );
}
