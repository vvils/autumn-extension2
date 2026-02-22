import { StorageEnum } from '../base/enums';
import { createStorage } from '../base/base';
import type { BaseStorage } from '../base/types';

export interface SavedShortcut {
  id: string;
  command: string;
  prompt: string;
  createdAt: number;
}

export interface ShortcutSettingsConfig {
  shortcuts: SavedShortcut[];
}

export type ShortcutSettingsStorage = BaseStorage<ShortcutSettingsConfig> & {
  getSettings: () => Promise<ShortcutSettingsConfig>;
  updateSettings: (settings: Partial<ShortcutSettingsConfig>) => Promise<void>;
  resetToDefaults: () => Promise<void>;
  addShortcut: (command: string, prompt: string) => Promise<void>;
  updateShortcut: (id: string, updates: { command?: string; prompt?: string }) => Promise<void>;
  deleteShortcut: (id: string) => Promise<void>;
  getShortcutByCommand: (command: string) => Promise<SavedShortcut | undefined>;
};

export const DEFAULT_SHORTCUT_SETTINGS: ShortcutSettingsConfig = {
  shortcuts: [],
};

const storage = createStorage<ShortcutSettingsConfig>('shortcut-settings', DEFAULT_SHORTCUT_SETTINGS, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

function sanitizeCommand(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

export const shortcutSettingsStore: ShortcutSettingsStorage = {
  ...storage,
  async getSettings() {
    const settings = await storage.get();
    return settings || DEFAULT_SHORTCUT_SETTINGS;
  },
  async updateSettings(settings: Partial<ShortcutSettingsConfig>) {
    const currentSettings = (await storage.get()) || DEFAULT_SHORTCUT_SETTINGS;
    await storage.set({
      ...currentSettings,
      ...settings,
    });
  },
  async resetToDefaults() {
    await storage.set(DEFAULT_SHORTCUT_SETTINGS);
  },
  async addShortcut(command: string, prompt: string) {
    const sanitized = sanitizeCommand(command);
    if (!sanitized) return;
    const currentSettings = await this.getSettings();
    const duplicate = currentSettings.shortcuts.some(s => s.command === sanitized);
    if (duplicate) return;

    const localId = `shortcut_${Date.now()}`;
    await this.updateSettings({
      shortcuts: [...currentSettings.shortcuts, { id: localId, command: sanitized, prompt, createdAt: Date.now() }],
    });

    chrome.runtime.sendMessage({ type: 'shortcut_created', command: sanitized, prompt, localId }).catch(() => {});
  },
  async updateShortcut(id: string, updates: { command?: string; prompt?: string }) {
    const currentSettings = await this.getSettings();
    const index = currentSettings.shortcuts.findIndex(s => s.id === id);
    if (index === -1) return;
    const updated = { ...currentSettings.shortcuts[index] };
    if (updates.command !== undefined) {
      const sanitized = sanitizeCommand(updates.command);
      if (!sanitized) return;
      const duplicate = currentSettings.shortcuts.some(s => s.command === sanitized && s.id !== id);
      if (duplicate) return;
      updated.command = sanitized;
    }
    if (updates.prompt !== undefined) {
      updated.prompt = updates.prompt;
    }
    const shortcuts = [...currentSettings.shortcuts];
    shortcuts[index] = updated;
    await this.updateSettings({ shortcuts });

    chrome.runtime.sendMessage({ type: 'shortcut_updated', id, updates }).catch(() => {});
  },
  async deleteShortcut(id: string) {
    const currentSettings = await this.getSettings();
    await this.updateSettings({
      shortcuts: currentSettings.shortcuts.filter(s => s.id !== id),
    });

    chrome.runtime.sendMessage({ type: 'shortcut_deleted', id }).catch(() => {});
  },
  async getShortcutByCommand(command: string) {
    const currentSettings = await this.getSettings();
    return currentSettings.shortcuts.find(s => s.command === command);
  },
};
