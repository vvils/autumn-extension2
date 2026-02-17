import { MonitorPlay } from 'lucide-react';

interface ActiveGroupOverlayProps {
  onGoBack: () => void;
}

export function ActiveGroupOverlay({ onGoBack }: ActiveGroupOverlayProps) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white p-6 text-center">
      <div className="mb-4 rounded-full bg-blue-50 p-4">
        <MonitorPlay size={28} className="text-blue-500" />
      </div>
      <h2 className="mb-2 text-lg font-semibold text-gray-900">Autumn AI is active in this tab group</h2>
      <p className="mb-6 text-sm text-gray-500">Autumn AI can browse across sites and handle multi-tab tasks.</p>
      <button
        type="button"
        onClick={onGoBack}
        className="bg-accent hover:bg-accent-hover rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-colors">
        Open chat
      </button>
    </div>
  );
}
