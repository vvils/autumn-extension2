import { StorageEnum } from '../base/enums';
import { createStorage } from '../base/base';
import type { BaseStorage } from '../base/types';

interface ServerProvidedKeysConfig {
  providerIds: string[];
}

export type ServerProvidedKeysStorage = BaseStorage<ServerProvidedKeysConfig> & {
  setProviderIds: (ids: string[]) => Promise<void>;
  getProviderIds: () => Promise<string[]>;
  removeProviderId: (id: string) => Promise<void>;
};

const storage = createStorage<ServerProvidedKeysConfig>(
  'server-provided-keys',
  { providerIds: [] },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

export const serverProvidedKeysStore: ServerProvidedKeysStorage = {
  ...storage,
  async setProviderIds(ids: string[]) {
    await storage.set({ providerIds: ids });
  },
  async getProviderIds() {
    const config = await storage.get();
    return config?.providerIds ?? [];
  },
  async removeProviderId(id: string) {
    const config = await storage.get();
    const current = config?.providerIds ?? [];
    await storage.set({ providerIds: current.filter(pid => pid !== id) });
  },
};
