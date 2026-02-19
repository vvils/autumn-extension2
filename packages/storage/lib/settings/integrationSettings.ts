import { StorageEnum } from '../base/enums';
import { createStorage } from '../base/base';
import type { BaseStorage } from '../base/types';

export interface ConnectedAccount {
  accountId: string;
  appName: string;
  appSlug: string;
  createdAt: number;
}

export interface ManifestProp {
  name: string;
  type: string;
  required: boolean;
  label?: string;
  description?: string;
  default?: unknown;
  options?: string[];
  min?: number;
  max?: number;
}

export interface CuratedAction {
  key: string;
  name: string;
  description: string;
  appSlug: string;
  props: ManifestProp[];
}

export interface IntegrationSettingsConfig {
  connectedAccounts: ConnectedAccount[];
  availableActions: CuratedAction[];
  lastSyncedAt: number;
}

export type IntegrationSettingsStorage = BaseStorage<IntegrationSettingsConfig> & {
  updateSettings: (settings: Partial<IntegrationSettingsConfig>) => Promise<void>;
  getSettings: () => Promise<IntegrationSettingsConfig>;
  resetToDefaults: () => Promise<void>;
};

export const DEFAULT_INTEGRATION_SETTINGS: IntegrationSettingsConfig = {
  connectedAccounts: [],
  availableActions: [],
  lastSyncedAt: 0,
};

const storage = createStorage<IntegrationSettingsConfig>('integration-settings', DEFAULT_INTEGRATION_SETTINGS, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

export const integrationSettingsStore: IntegrationSettingsStorage = {
  ...storage,
  async updateSettings(settings: Partial<IntegrationSettingsConfig>) {
    const currentSettings = (await storage.get()) || DEFAULT_INTEGRATION_SETTINGS;
    await storage.set({
      ...currentSettings,
      ...settings,
    });
  },
  async getSettings() {
    const settings = await storage.get();
    return {
      ...DEFAULT_INTEGRATION_SETTINGS,
      ...settings,
    };
  },
  async resetToDefaults() {
    await storage.set(DEFAULT_INTEGRATION_SETTINGS);
  },
};
