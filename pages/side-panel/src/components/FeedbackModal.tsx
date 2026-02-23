import { useState, useEffect, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';
import { serverFetch } from '@extension/shared';

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

export function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const [feedback, setFeedback] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (open) {
      setFeedback('');
      setStatus('idle');
      setErrorMessage('');
    }
  }, [open]);

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

  const handleSubmit = async () => {
    if (!feedback.trim() || status === 'submitting') return;
    setStatus('submitting');
    setErrorMessage('');
    try {
      const res = await serverFetch('/ai/extension/feedback', {
        method: 'POST',
        body: JSON.stringify({ feedback: feedback.trim() }),
      });
      if (!res.ok) throw new Error(`Server error (${res.status})`);
      setStatus('success');
      setTimeout(onClose, 1500);
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong');
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity duration-200 ease-out ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      aria-hidden={!open}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />

      <div
        className={`absolute inset-x-0 bottom-0 flex max-h-[70%] flex-col rounded-t-[20px] bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.08)] transition-transform duration-200 ease-out ${open ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="flex shrink-0 items-center justify-between px-4 py-3">
          <h2 className="text-[15px] font-semibold text-gray-900">Send Feedback</h2>
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
            <label className="mb-1.5 block text-[13px] font-medium text-gray-700">
              What would you like us to do for you?
            </label>
            <textarea
              value={feedback}
              onChange={e => setFeedback(e.target.value.slice(0, 2000))}
              rows={6}
              placeholder="Tell us what you'd like..."
              className="w-full resize-none rounded-lg border-0 bg-[#f4f4f4] px-3 py-2 text-[13px] leading-relaxed text-gray-900 outline-none focus:ring-2 focus:ring-black/20"
            />
            <p className="text-right text-[11px] text-gray-400">{feedback.length}/2000</p>
          </div>
          {status === 'error' && <p className="text-[11px] text-red-500">{errorMessage}</p>}
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
            onClick={handleSubmit}
            disabled={!feedback.trim() || status === 'submitting'}
            className="bg-accent hover:bg-accent-hover flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium text-white transition-colors disabled:opacity-40">
            {status === 'submitting' && <Loader2 className="animate-spin size-4" />}
            Send Feedback
          </button>
        </div>
      </div>
    </div>
  );
}
