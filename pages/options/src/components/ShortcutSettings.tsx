import { useState, useEffect, useCallback } from 'react';
import { shortcutSettingsStore } from '@extension/storage';
import type { SavedShortcut } from '@extension/storage';
import { FiPlus, FiTerminal } from 'react-icons/fi';

interface ShortcutSettingsProps {
  isDarkMode?: boolean;
}

function ShortcutTile({ shortcut, onClick }: { shortcut: SavedShortcut; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        filter: 'drop-shadow(rgba(0,0,0,0.07) 0px 0.5px 0.5px) drop-shadow(rgba(0,0,0,0.06) 0px 1px 2px)',
      }}
      className="h-[188px] w-52 shrink-0 rounded-[24px] text-left transition-shadow duration-300 hover:shadow-md">
      <div className="flex size-full flex-col justify-between rounded-[24px] bg-white p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,1),inset_-1px_-1px_1px_rgba(255,255,255,1)]">
        <div className="flex size-6 items-center justify-center rounded-xl bg-neutral-100">
          <FiTerminal className="size-3.5 text-black/60" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-black">/{shortcut.command}</p>
          <p className="line-clamp-2 text-xs leading-tight text-neutral-500">{shortcut.prompt}</p>
        </div>
      </div>
    </button>
  );
}

function CreateTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        filter: 'drop-shadow(rgba(0,0,0,0.07) 0px 0.5px 0.5px) drop-shadow(rgba(0,0,0,0.06) 0px 1px 2px)',
      }}
      className="h-[188px] w-52 shrink-0 rounded-[24px] text-left transition-shadow duration-300 hover:shadow-md">
      <div className="flex size-full flex-col justify-between rounded-[24px] bg-white p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,1),inset_-1px_-1px_1px_rgba(255,255,255,1)]">
        <div className="flex size-10 items-center justify-center rounded-full bg-black/5 transition-colors hover:bg-black/10">
          <FiPlus className="size-4 text-neutral-800" strokeWidth={1.8} />
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium text-black">New Shortcut</p>
          <p className="text-xs leading-tight text-neutral-500">Create a quick command</p>
        </div>
      </div>
    </button>
  );
}

export const ShortcutSettings = (props: ShortcutSettingsProps) => {
  void props;
  const [shortcuts, setShortcuts] = useState<SavedShortcut[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState<SavedShortcut | null>(null);
  const [command, setCommand] = useState('');
  const [prompt, setPrompt] = useState('');

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
    closeModal();
    await loadShortcuts();
  };

  const modal = showModal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeModal}>
      <div
        className="w-full max-w-md rounded-[20px] bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.06)]"
        onClick={e => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-medium text-black">{editingShortcut ? 'Edit Shortcut' : 'Create Shortcut'}</h3>

        <div className="mb-4">
          <label className="mb-1 block text-[14px] font-medium text-black">Command</label>
          <div className="flex items-center">
            <span className="rounded-l-lg border-0 bg-neutral-100 px-3 py-2 text-sm text-black/40">/</span>
            <input
              type="text"
              value={command}
              onChange={e => setCommand(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
              placeholder="my-shortcut"
              className="flex-1 rounded-r-lg border-0 bg-neutral-100 px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-black/20"
            />
          </div>
        </div>

        <div className="mb-6">
          <label className="mb-1 block text-[14px] font-medium text-black">Prompt</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={4}
            placeholder="The prompt text that will be sent..."
            className="w-full rounded-lg border-0 bg-neutral-100 px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-black/20"
          />
        </div>

        <div className="flex justify-between">
          {editingShortcut ? (
            <button
              onClick={() => handleDelete(editingShortcut.id)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50">
              Delete
            </button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <button
              onClick={closeModal}
              className="rounded-lg bg-neutral-200 px-3 py-1.5 text-xs font-medium text-black/70 transition-colors hover:bg-neutral-300">
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-black/90">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div key="list" className="animate-fadeIn">
      <section className="mt-12">
        <div className="mb-6">
          <h2 className="text-lg font-medium text-black">Your Shortcuts</h2>
          <p className="py-0.5 text-sm text-black/50">Quick commands for common prompts</p>
        </div>
        <div className="relative">
          <div className="scrollbar-hide -m-1 flex gap-4 overflow-x-auto overflow-y-visible p-1">
            {shortcuts.map(shortcut => (
              <ShortcutTile key={shortcut.id} shortcut={shortcut} onClick={() => openEditModal(shortcut)} />
            ))}
            <CreateTile onClick={openCreateModal} />
          </div>
          <div
            className="pointer-events-none absolute inset-y-0 -right-4 z-10 w-12"
            style={{
              backgroundImage: 'linear-gradient(to left, white 0%, white 25%, transparent 100%)',
            }}
          />
        </div>
      </section>

      {shortcuts.length === 0 && (
        <section className="mt-12">
          <p className="text-sm text-black/40">No shortcuts yet. Click the card above to create one.</p>
        </section>
      )}

      {modal}
    </div>
  );
};
