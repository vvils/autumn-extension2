import { useEffect, useRef } from 'react';
import { Zap } from 'lucide-react';
import type { SavedShortcut } from '@extension/storage';

interface ShortcutDropdownProps {
  shortcuts: SavedShortcut[];
  onSelect: (shortcut: SavedShortcut) => void;
  selectedIndex: number;
}

export default function ShortcutDropdown({ shortcuts, onSelect, selectedIndex }: ShortcutDropdownProps) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (shortcuts.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
      {shortcuts.map((shortcut, index) => (
        <button
          key={shortcut.id}
          ref={index === selectedIndex ? selectedRef : undefined}
          type="button"
          onClick={() => onSelect(shortcut)}
          onMouseDown={e => e.preventDefault()}
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors ${
            index === selectedIndex ? 'bg-gray-100' : 'hover:bg-gray-50'
          }`}>
          <Zap size={12} className="shrink-0 text-gray-400" />
          <span className="font-medium text-gray-700">/{shortcut.command}</span>
          <span className="truncate text-gray-400">{shortcut.prompt}</span>
        </button>
      ))}
    </div>
  );
}
