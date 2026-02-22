import { StorageEnum } from '../base/enums';
import { createStorage } from '../base/base';
import type { BaseStorage } from '../base/types';

export interface ServerSettingsConfig {
  serverUrl: string;
  clientUrl: string;
  accessToken: string;
  userId: string;
  tokenExpiresAt: number;
}

export type ServerSettingsStorage = BaseStorage<ServerSettingsConfig> & {
  updateSettings: (settings: Partial<ServerSettingsConfig>) => Promise<void>;
  getSettings: () => Promise<ServerSettingsConfig>;
  resetToDefaults: () => Promise<void>;
  isConfigured: () => Promise<boolean>;
  setAuth: (accessToken: string, userId: string, expiresAt: number) => Promise<void>;
  clearAuth: () => Promise<void>;
  hasValidToken: () => Promise<boolean>;
};

export function isTokenValid(settings: ServerSettingsConfig | null): boolean {
  if (!settings) return false;
  return Boolean(settings.accessToken) && settings.tokenExpiresAt > Date.now();
}

export const DEFAULT_SERVER_SETTINGS: ServerSettingsConfig = {
  serverUrl: '',
  clientUrl: '',
  accessToken: '',
  userId: '',
  tokenExpiresAt: 0,
};

const storage = createStorage<ServerSettingsConfig>('server-settings', DEFAULT_SERVER_SETTINGS, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

export const serverSettingsStore: ServerSettingsStorage = {
  ...storage,
  async updateSettings(settings: Partial<ServerSettingsConfig>) {
    const currentSettings = (await storage.get()) || DEFAULT_SERVER_SETTINGS;
    await storage.set({
      ...currentSettings,
      ...settings,
    });
  },
  async getSettings() {
    const settings = await storage.get();
    return {
      ...DEFAULT_SERVER_SETTINGS,
      ...settings,
    };
  },
  async resetToDefaults() {
    await storage.set(DEFAULT_SERVER_SETTINGS);
  },
  async isConfigured() {
    const settings = await storage.get();
    return Boolean(settings?.serverUrl);
  },
  async setAuth(accessToken: string, userId: string, expiresAt: number) {
    const currentSettings = (await storage.get()) || DEFAULT_SERVER_SETTINGS;
    await storage.set({
      ...currentSettings,
      accessToken,
      userId,
      tokenExpiresAt: expiresAt,
    });
  },
  async clearAuth() {
    const currentSettings = (await storage.get()) || DEFAULT_SERVER_SETTINGS;
    await storage.set({
      ...currentSettings,
      accessToken: '',
      userId: '',
      tokenExpiresAt: 0,
    });
  },
  async hasValidToken() {
    const settings = await storage.get();
    return isTokenValid(settings);
  },
};
