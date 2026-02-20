import { useState, useEffect, useCallback } from 'react';
import { shortcutSettingsStore } from '@extension/storage';
import type { SavedShortcut } from '@extension/storage';

interface ShortcutSettingsProps {
  isDarkMode: boolean;
}

export const ShortcutSettings = (_props: ShortcutSettingsProps) => {
  const [shortcuts, setShortcuts] = useState<SavedShortcut[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState<SavedShortcut | null>(null);
  const [command, setCommand] = useState('');
  const [prompt, setPrompt] = useState('');

  const cardClass =
    'rounded-[20px] bg-white p-6 text-left shadow-[inset_0_1px_1px_#fff,inset_-1px_-1px_1px_#fff,0_0_0_transparent] hover:shadow-[inset_0_1px_1px_#fff,inset_-1px_-1px_1px_#fff,0_4px_12px_rgba(0,0,0,0.08)] transition-shadow duration-500 ease-out';

  const loadShortcuts = useCallback(async () => {
    const settings = await shortcutSettingsStore.getSettings();
    setShortcuts(settings.shortcuts);
  }, []);

  useEffect(() => {
    loadShortcuts();
  }, [loadShortcuts]);

  const openCreateModal = () => {
    setEditingShortcut(null);
    setCommand('');
    setPrompt('');
    setShowModal(true);
  };

  const openEditModal = (shortcut: SavedShortcut) => {
    setEditingShortcut(shortcut);
    setCommand(shortcut.command);
    setPrompt(shortcut.prompt);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingShortcut(null);
    setCommand('');
    setPrompt('');
  };

  const handleSave = async () => {
    const sanitized = command.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
    if (!sanitized || !prompt.trim()) return;
    if (editingShortcut) {
      await shortcutSettingsStore.updateShortcut(editingShortcut.id, { command: sanitized, prompt: prompt.trim() });
    } else {
      await shortcutSettingsStore.addShortcut(sanitized, prompt.trim());
    }
    await loadShortcuts();
    closeModal();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this shortcut?')) return;
    await shortcutSettingsStore.deleteShortcut(id);
    await loadShortcuts();
  };

  return (
    <section className="space-y-6">
      <div className={cardClass}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-left text-lg font-medium text-black">{'Shortcuts'}</h2>
          <button
            onClick={openCreateModal}
            className="rounded-lg bg-neutral-200 px-3 py-1.5 text-xs font-medium text-black/70 transition-colors hover:bg-neutral-300">
            {'Create Shortcut'}
          </button>
        </div>

        {shortcuts.length === 0 ? (
          <p className="text-sm text-black/40">{'No shortcuts yet. Create one to get started.'}</p>
        ) : (
          <div className="space-y-2">
            {shortcuts.map(shortcut => (
              <div key={shortcut.id} className="flex items-center justify-between rounded-xl bg-[#f4f4f4] px-3 py-2.5">
                <div className="mr-3 flex min-w-0 flex-1 items-center">
                  <span className="shrink-0 text-sm font-medium text-black">/{shortcut.command}</span>
                  <span className="ml-2 truncate text-sm text-black/40">{shortcut.prompt}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => openEditModal(shortcut)}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-black/60 transition-colors hover:bg-white">
                    {'Edit'}
                  </button>
                  <button
                    onClick={() => handleDelete(shortcut.id)}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50">
                    {'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-[20px] bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.06)]">
            <h3 className="mb-4 text-lg font-medium text-black">
              {editingShortcut ? 'Edit Shortcut' : 'Create Shortcut'}
            </h3>

            <div className="mb-4">
              <label className="mb-1 block text-[14px] font-medium text-black">{'Command'}</label>
              <div className="flex items-center">
                <span className="rounded-l-lg border-0 bg-[#f4f4f4] px-3 py-2 text-sm text-black/40">/</span>
                <input
                  type="text"
                  value={command}
                  onChange={e => setCommand(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                  placeholder="my-shortcut"
                  className="flex-1 rounded-r-lg border-0 bg-[#f4f4f4] px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-black/20"
                />
              </div>
            </div>

            <div className="mb-6">
              <label className="mb-1 block text-[14px] font-medium text-black">{'Prompt'}</label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                rows={4}
                placeholder="The prompt text that will be sent..."
                className="w-full rounded-lg border-0 bg-[#f4f4f4] px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-black/20"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={closeModal}
                className="rounded-lg bg-neutral-200 px-3 py-1.5 text-xs font-medium text-black/70 transition-colors hover:bg-neutral-300">
                {'Cancel'}
              </button>
              <button
                onClick={handleSave}
                className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-black/90">
                {'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
