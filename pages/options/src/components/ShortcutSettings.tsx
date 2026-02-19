import { useState, useEffect, useCallback } from 'react';
import { shortcutSettingsStore } from '@extension/storage';
import type { SavedShortcut } from '@extension/storage';

interface ShortcutSettingsProps {
  isDarkMode: boolean;
}

export const ShortcutSettings = ({ isDarkMode }: ShortcutSettingsProps) => {
  const [shortcuts, setShortcuts] = useState<SavedShortcut[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState<SavedShortcut | null>(null);
  const [command, setCommand] = useState('');
  const [prompt, setPrompt] = useState('');

  const cardClass = `rounded-lg border ${isDarkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'} p-6 text-left shadow-sm`;
  const headingClass = `text-left text-xl font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`;

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
          <h2 className={headingClass}>{'Shortcuts'}</h2>
          <button
            onClick={openCreateModal}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              isDarkMode
                ? 'bg-slate-600 text-gray-200 hover:bg-slate-500'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}>
            {'Create Shortcut'}
          </button>
        </div>

        {shortcuts.length === 0 ? (
          <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {'No shortcuts yet. Create one to get started.'}
          </p>
        ) : (
          <div className="space-y-2">
            {shortcuts.map(shortcut => (
              <div
                key={shortcut.id}
                className={`flex items-center justify-between rounded-md border px-3 py-2 ${
                  isDarkMode ? 'border-slate-600 bg-slate-700/50' : 'border-gray-100 bg-gray-50'
                }`}>
                <div className="mr-3 min-w-0 flex-1">
                  <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                    /{shortcut.command}
                  </span>
                  <span className={`ml-2 truncate text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {shortcut.prompt}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => openEditModal(shortcut)}
                    className={`rounded-md px-2 py-1 text-xs font-medium ${
                      isDarkMode ? 'text-gray-300 hover:bg-slate-600' : 'text-gray-600 hover:bg-gray-100'
                    }`}>
                    {'Edit'}
                  </button>
                  <button
                    onClick={() => handleDelete(shortcut.id)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
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
          <div
            className={`w-full max-w-md rounded-lg border p-6 shadow-xl ${
              isDarkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'
            }`}>
            <h3 className={`mb-4 text-xl font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
              {editingShortcut ? 'Edit Shortcut' : 'Create Shortcut'}
            </h3>

            <div className="mb-4">
              <label className={`mb-1 block text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                {'Command'}
              </label>
              <div className="flex items-center">
                <span
                  className={`rounded-l-md border border-r-0 px-3 py-2 text-sm ${isDarkMode ? 'border-gray-600 bg-slate-700 text-gray-400' : 'border-gray-300 bg-gray-100 text-gray-500'}`}>
                  /
                </span>
                <input
                  type="text"
                  value={command}
                  onChange={e => setCommand(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                  placeholder="my-shortcut"
                  className={`flex-1 rounded-r-md border px-3 py-2 text-sm ${isDarkMode ? 'border-gray-600 bg-slate-700 text-white' : 'border-gray-300 bg-white text-gray-700'}`}
                />
              </div>
            </div>

            <div className="mb-6">
              <label className={`mb-1 block text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                {'Prompt'}
              </label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                rows={4}
                placeholder="The prompt text that will be sent..."
                className={`w-full rounded-md border px-3 py-2 text-sm ${isDarkMode ? 'border-gray-600 bg-slate-700 text-white' : 'border-gray-300 bg-white text-gray-700'}`}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={closeModal}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  isDarkMode
                    ? 'bg-slate-700 text-gray-200 hover:bg-slate-600'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}>
                {'Cancel'}
              </button>
              <button
                onClick={handleSave}
                className="bg-accent hover:bg-accent-hover rounded-md px-3 py-1.5 text-xs font-medium text-white">
                {'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
