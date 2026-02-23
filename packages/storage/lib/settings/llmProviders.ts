import { StorageEnum } from '../base/enums';
import { createStorage } from '../base/base';
import type { BaseStorage } from '../base/types';
import { llmProviderModelNames, ProviderTypeEnum } from './types';

export interface ProviderConfig {
  name?: string;
  type?: ProviderTypeEnum;
  apiKey: string;
  baseUrl?: string;
  modelNames?: string[];
  createdAt?: number;
}

export interface LLMKeyRecord {
  providers: Record<string, ProviderConfig>;
}

export type LLMProviderStorage = BaseStorage<LLMKeyRecord> & {
  setProvider: (providerId: string, config: ProviderConfig) => Promise<void>;
  getProvider: (providerId: string) => Promise<ProviderConfig | undefined>;
  removeProvider: (providerId: string) => Promise<void>;
  hasProvider: (providerId: string) => Promise<boolean>;
  getAllProviders: () => Promise<Record<string, ProviderConfig>>;
};

const storage = createStorage<LLMKeyRecord>(
  'llm-api-keys',
  { providers: {} },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

export function getProviderTypeByProviderId(providerId: string): ProviderTypeEnum {
  switch (providerId) {
    case ProviderTypeEnum.OpenAI:
      return ProviderTypeEnum.OpenAI;
    case ProviderTypeEnum.Anthropic:
      return ProviderTypeEnum.Anthropic;
    default:
      return ProviderTypeEnum.OpenAI;
  }
}

function getDefaultDisplayNameFromProviderId(providerId: string): string {
  switch (providerId) {
    case ProviderTypeEnum.OpenAI:
      return 'OpenAI';
    case ProviderTypeEnum.Anthropic:
      return 'Anthropic';
    default:
      return providerId;
  }
}

function ensureBackwardCompatibility(providerId: string, config: ProviderConfig): ProviderConfig {
  const updatedConfig = { ...config };

  if (!updatedConfig.name) {
    updatedConfig.name = getDefaultDisplayNameFromProviderId(providerId);
  }
  if (!updatedConfig.type) {
    updatedConfig.type = getProviderTypeByProviderId(providerId);
  }

  if (!updatedConfig.modelNames) {
    updatedConfig.modelNames = llmProviderModelNames[providerId as keyof typeof llmProviderModelNames] || [];
  }

  if (!updatedConfig.createdAt) {
    updatedConfig.createdAt = new Date('03/04/2025').getTime();
  }

  return updatedConfig;
}

export const llmProviderStore: LLMProviderStorage = {
  ...storage,
  async setProvider(providerId: string, config: ProviderConfig) {
    if (!providerId) {
      throw new Error('Provider id cannot be empty');
    }

    if (config.apiKey === undefined) {
      throw new Error('API key must be provided (can be empty for local models)');
    }

    const providerType = config.type || getProviderTypeByProviderId(providerId);

    if (!config.apiKey?.trim()) {
      throw new Error(`API Key is required for ${getDefaultDisplayNameFromProviderId(providerId)}`);
    }

    if (!config.modelNames || config.modelNames.length === 0) {
      console.warn(`Provider ${providerId} of type ${providerType} is being saved without model names.`);
    }

    const completeConfig: ProviderConfig = {
      apiKey: config.apiKey || '',
      baseUrl: config.baseUrl,
      name: config.name || getDefaultDisplayNameFromProviderId(providerId),
      type: providerType,
      createdAt: config.createdAt || Date.now(),
      modelNames: config.modelNames || [],
    };

    console.log(
      `[llmProviderStore.setProvider] Saving config for ${providerId}:`,
      JSON.stringify({ ...completeConfig, apiKey: '[REDACTED]' }),
    );

    const current = (await storage.get()) || { providers: {} };
    await storage.set({
      providers: {
        ...current.providers,
        [providerId]: completeConfig,
      },
    });
  },
  async getProvider(providerId: string) {
    const data = (await storage.get()) || { providers: {} };
    const config = data.providers[providerId];
    return config ? ensureBackwardCompatibility(providerId, config) : undefined;
  },
  async removeProvider(providerId: string) {
    const current = (await storage.get()) || { providers: {} };
    const newProviders = { ...current.providers };
    delete newProviders[providerId];
    await storage.set({ providers: newProviders });
  },
  async hasProvider(providerId: string) {
    const data = (await storage.get()) || { providers: {} };
    return providerId in data.providers;
  },

  async getAllProviders() {
    const data = await storage.get();
    const providers = { ...data.providers };

    for (const [providerId, config] of Object.entries(providers)) {
      providers[providerId] = ensureBackwardCompatibility(providerId, config);
    }

    return providers;
  },
};
