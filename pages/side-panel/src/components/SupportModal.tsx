import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, Camera } from 'lucide-react';
import { canCaptureActiveTab, captureScreenshot } from '../utils/screenshotCapture';
import { serverFetch } from '@extension/shared';

interface SupportModalProps {
  open: boolean;
  onClose: () => void;
}

export function SupportModal({ open, onClose }: SupportModalProps) {
  const [message, setMessage] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [canCapture, setCanCapture] = useState(true);

  useEffect(() => {
    if (open) {
      setMessage('');
      setScreenshot(null);
      setStatus('idle');
      setErrorMessage('');
      canCaptureActiveTab().then(setCanCapture);
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

  const handleCaptureScreenshot = async () => {
    try {
      const result = await captureScreenshot();
      if (result) setScreenshot(result.croppedDataUrl);
    } catch (err) {
      console.error('Screenshot capture failed:', err);
    }
  };

  const handleSubmit = async () => {
    if (!message.trim() || status === 'submitting') return;
    setStatus('submitting');
    setErrorMessage('');
    try {
      const res = await serverFetch('/ai/extension/support', {
        method: 'POST',
        body: JSON.stringify({
          message: message.trim(),
          ...(screenshot && { screenshot }),
        }),
        signal: AbortSignal.timeout(30_000),
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
          <h2 className="text-[15px] font-semibold text-gray-900">Contact Support</h2>
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
            <label className="mb-1.5 block text-[13px] font-medium text-gray-700">Message</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value.slice(0, 5000))}
              rows={6}
              placeholder="Describe your issue..."
              className="w-full resize-none rounded-lg border-0 bg-[#f4f4f4] px-3 py-2 text-[13px] leading-relaxed text-gray-900 outline-none focus:ring-2 focus:ring-black/20"
            />
            <p className="text-right text-[11px] text-gray-400">{message.length}/5000</p>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-gray-700">Screenshot (optional)</label>
            {screenshot ? (
              <div className="relative inline-block">
                <img src={screenshot} alt="Screenshot preview" className="h-[60px] rounded-lg" />
                <button
                  type="button"
                  onClick={() => setScreenshot(null)}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 shadow-md transition-colors hover:bg-gray-100"
                  aria-label="Remove screenshot">
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleCaptureScreenshot}
                disabled={!canCapture}
                title={canCapture ? 'Capture screen' : 'Cannot capture on this page'}
                className={`flex items-center gap-1.5 rounded-lg bg-[#f4f4f4] px-3 py-2 text-[13px] transition-colors ${canCapture ? 'text-gray-700 hover:bg-[#e8e8e8]' : 'cursor-not-allowed text-gray-400 opacity-50'}`}>
                <Camera size={14} />
                {canCapture ? 'Capture Screenshot' : 'Cannot capture on this page'}
              </button>
            )}
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
            disabled={!message.trim() || status === 'submitting'}
            className="bg-accent hover:bg-accent-hover flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium text-white transition-colors disabled:opacity-40">
            {status === 'submitting' && <Loader2 className="animate-spin size-4" />}
            Send Message
          </button>
        </div>
      </div>
    </div>
  );
}
