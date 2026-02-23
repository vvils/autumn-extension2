import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import {
  serverSettingsStore,
  DEFAULT_SERVER_SETTINGS,
  llmProviderStore,
  agentModelStore,
  isTokenValid,
  type ProviderConfig,
  type AgentNameEnum,
} from '@extension/storage';
import type { ModelConfig } from '@extension/storage/lib/settings/agentModels';
interface ServerSettingsProps {
  isDarkMode?: boolean;
}

function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '••••••••';
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
}

export const ServerSettings = ({ isDarkMode = false }: ServerSettingsProps) => {
  const settingsSnapshot = useSyncExternalStore(serverSettingsStore.subscribe, serverSettingsStore.getSnapshot);
  const settings = settingsSnapshot ?? DEFAULT_SERVER_SETTINGS;
  const isAuthenticated = isTokenValid(settings);

  const [providers, setProviders] = useState<Record<string, ProviderConfig>>({});
  const [agentModels, setAgentModels] = useState<Record<string, ModelConfig>>({});

  const loadServerConfig = useCallback(async () => {
    const [allProviders, allAgentModels] = await Promise.all([
      llmProviderStore.getAllProviders(),
      agentModelStore.getAllAgentModels(),
    ]);
    setProviders(allProviders);
    setAgentModels(allAgentModels);
  }, []);

  useEffect(() => {
    loadServerConfig();
    const unsubLlm = llmProviderStore.subscribe(() => {
      loadServerConfig();
    });
    const unsubAgent = agentModelStore.subscribe(() => {
      loadServerConfig();
    });
    return () => {
      unsubLlm();
      unsubAgent();
    };
  }, [loadServerConfig]);

  const cardClass =
    'rounded-[20px] bg-white p-6 text-left shadow-[inset_0_1px_1px_#fff,inset_-1px_-1px_1px_#fff,0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[inset_0_1px_1px_#fff,inset_-1px_-1px_1px_#fff,0_4px_12px_rgba(0,0,0,0.08)] transition-shadow duration-500 ease-out';
  const headingClass = 'mb-4 text-left text-lg font-medium text-black';
  const labelClass = 'text-xs font-medium uppercase tracking-wider text-black/50';
  const valueClass = `text-sm ${isDarkMode ? 'text-gray-300' : 'text-black/70'}`;

  return (
    <section className="mt-12 space-y-6">
      <div className={cardClass}>
        <h2 className={headingClass}>{'Server URL'}</h2>
        <p className="text-sm text-black/60">{settings.serverUrl || 'Not configured'}</p>
      </div>

      <div className={cardClass}>
        <h2 className={headingClass}>{'Authentication'}</h2>
        <div className="flex items-center gap-3">
          <span className={`inline-block size-2.5 rounded-full ${isAuthenticated ? 'bg-green-500' : 'bg-red-500'}`} />
          <p className="text-sm text-black/60">
            {isAuthenticated ? `Automatically connected as ${settings.userId}` : 'Not connected'}
          </p>
        </div>
        {!isAuthenticated && (
          <p className="mt-2 text-xs text-black/40">{'Sign in at the Autumn dashboard to connect automatically'}</p>
        )}
      </div>

      {isAuthenticated && (
        <div className={cardClass}>
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-left text-lg font-medium text-black">{'Server Configuration'}</h2>
            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-medium text-black/50">
              {'Managed by server'}
            </span>
          </div>

          {Object.keys(providers).length > 0 && (
            <div className="mb-5">
              <h3 className={`mb-2 ${labelClass}`}>{'API Providers'}</h3>
              <div className="space-y-2">
                {Object.entries(providers).map(([id, config]) => (
                  <div key={id} className="flex items-center justify-between rounded-xl bg-neutral-100 px-3 py-2.5">
                    <div>
                      <span className="text-sm font-medium text-black">{config.name || id}</span>
                      {config.type && <span className="ml-2 text-xs text-black/50">{config.type}</span>}
                    </div>
                    <code className="text-xs text-black/50">{maskApiKey(config.apiKey)}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(agentModels).length > 0 && (
            <div>
              <h3 className={`mb-2 ${labelClass}`}>{'Agent Model Assignments'}</h3>
              <div className="space-y-2">
                {Object.entries(agentModels).map(([agentKey, config]) => (
                  <div
                    key={agentKey}
                    className="flex items-center justify-between rounded-xl bg-neutral-100 px-3 py-2.5">
                    <span className="text-sm font-medium capitalize text-black">{agentKey as AgentNameEnum}</span>
                    <span className={valueClass}>
                      {config.provider} / {config.modelName}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(providers).length === 0 && Object.keys(agentModels).length === 0 && (
            <p className="text-sm text-black/40">{'No configuration received from server yet'}</p>
          )}
        </div>
      )}
    </section>
  );
};
