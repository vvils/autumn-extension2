import { useState, useEffect, useCallback, useRef } from 'react';
import { X, EllipsisVertical } from 'lucide-react';

interface ShortcutEditorModalProps {
  open: boolean;
  onClose: () => void;
  shortcut: { command: string; prompt: string } | null;
  onSave: (command: string, prompt: string) => void;
  onDelete: () => void;
  existingCommands?: string[];
}

export function ShortcutEditorModal({
  open,
  onClose,
  shortcut,
  onSave,
  onDelete,
  existingCommands = [],
}: ShortcutEditorModalProps) {
  const [editName, setEditName] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [nameError, setNameError] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  const isCreateMode = !shortcut;

  useEffect(() => {
    if (open) {
      setEditName(shortcut?.command ?? '');
      setEditPrompt(shortcut?.prompt ?? '');
      setNameError('');
      setShowMenu(false);
    }
  }, [open, shortcut]);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showMenu) setShowMenu(false);
        else onClose();
      }
    },
    [onClose, showMenu],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, handleEscape]);

  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const canSave = editName.trim() !== '' && editPrompt.trim() !== '' && !nameError;

  const handleNameChange = (value: string) => {
    const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, '');
    setEditName(cleaned);
    const sanitized = cleaned.toLowerCase();
    const originalCommand = shortcut?.command?.toLowerCase();
    if (sanitized && existingCommands.some(c => c.toLowerCase() === sanitized && c.toLowerCase() !== originalCommand)) {
      setNameError('A shortcut with this name already exists');
    } else {
      setNameError('');
    }
  };

  const handleSave = () => {
    if (!canSave) return;
    const sanitized = editName.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
    if (!sanitized) return;
    onSave(sanitized, editPrompt.trim());
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
          <h2 className="text-[15px] font-semibold text-gray-900">
            {isCreateMode ? 'Create Shortcut' : 'Edit Shortcut'}
          </h2>
          <div className="flex items-center gap-1">
            {!isCreateMode && (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setShowMenu(prev => !prev)}
                  className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  aria-label="More options">
                  <EllipsisVertical size={16} />
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-xl bg-white py-1 shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        onDelete();
                      }}
                      className="w-full px-3 py-2 text-left text-[13px] text-red-600 transition-colors hover:bg-red-50">
                      Delete Shortcut
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-[20px]">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-gray-700">Name</label>
            <div className="flex items-center">
              <span className="rounded-l-lg border-0 bg-[#f4f4f4] px-3 py-2 text-[13px] text-gray-400">/</span>
              <input
                type="text"
                value={editName}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="my-shortcut"
                className={`flex-1 rounded-r-lg border-0 bg-[#f4f4f4] px-3 py-2 text-[13px] text-gray-900 outline-none focus:ring-2 ${
                  nameError ? 'focus:ring-red-100' : 'focus:ring-black/20'
                }`}
              />
            </div>
            {nameError && <p className="mt-1 text-[11px] text-red-500">{nameError}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-gray-700">Prompt</label>
            <textarea
              value={editPrompt}
              onChange={e => setEditPrompt(e.target.value)}
              rows={8}
              placeholder="The prompt text that will be sent..."
              className="w-full resize-none rounded-lg border-0 bg-[#f4f4f4] px-3 py-2 text-[13px] leading-relaxed text-gray-900 outline-none focus:ring-2 focus:ring-black/20"
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
            onClick={handleSave}
            disabled={!canSave}
            className="bg-accent hover:bg-accent-hover rounded-lg px-3.5 py-2 text-[13px] font-medium text-white transition-colors disabled:opacity-40">
            {isCreateMode ? 'Create Shortcut' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
