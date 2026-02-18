import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import {
  serverSettingsStore,
  DEFAULT_SERVER_SETTINGS,
  llmProviderStore,
  agentModelStore,
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
  const isAuthenticated = Boolean(settings.accessToken) && settings.tokenExpiresAt > Date.now();

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

  const cardClass = `rounded-lg border ${isDarkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'} p-6 text-left shadow-sm`;
  const headingClass = `mb-4 text-left text-xl font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`;
  const labelClass = `text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`;
  const valueClass = `text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`;

  return (
    <section className="space-y-6">
      {/* Server URL */}
      <div className={cardClass}>
        <h2 className={headingClass}>{'Server URL'}</h2>
        <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          {settings.serverUrl || 'Not configured'}
        </p>
      </div>

      {/* Authentication Status */}
      <div className={cardClass}>
        <h2 className={headingClass}>{'Authentication'}</h2>
        <div className="flex items-center gap-3">
          <span className={`inline-block size-2.5 rounded-full ${isAuthenticated ? 'bg-green-500' : 'bg-red-500'}`} />
          <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            {isAuthenticated ? `Automatically connected as ${settings.userId}` : 'Not connected'}
          </p>
        </div>
        {!isAuthenticated && (
          <p className={`mt-2 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {'Sign in at the Autumn dashboard to connect automatically'}
          </p>
        )}
      </div>

      {/* Server-provided configuration (read-only) */}
      {isAuthenticated && (
        <div className={cardClass}>
          <div className="mb-4 flex items-center gap-2">
            <h2 className={`text-left text-xl font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
              {'Server Configuration'}
            </h2>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${isDarkMode ? 'bg-slate-600 text-gray-300' : 'bg-gray-100 text-gray-500'}`}>
              {'Managed by server'}
            </span>
          </div>

          {/* API Keys / Providers */}
          {Object.keys(providers).length > 0 && (
            <div className="mb-5">
              <h3 className={`mb-2 ${labelClass}`}>{'API Providers'}</h3>
              <div className="space-y-2">
                {Object.entries(providers).map(([id, config]) => (
                  <div
                    key={id}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 ${isDarkMode ? 'border-slate-600 bg-slate-700/50' : 'border-gray-100 bg-gray-50'}`}>
                    <div>
                      <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                        {config.name || id}
                      </span>
                      {config.type && (
                        <span className={`ml-2 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {config.type}
                        </span>
                      )}
                    </div>
                    <code className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {maskApiKey(config.apiKey)}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Agent Model Assignments */}
          {Object.keys(agentModels).length > 0 && (
            <div>
              <h3 className={`mb-2 ${labelClass}`}>{'Agent Model Assignments'}</h3>
              <div className="space-y-2">
                {Object.entries(agentModels).map(([agentKey, config]) => (
                  <div
                    key={agentKey}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 ${isDarkMode ? 'border-slate-600 bg-slate-700/50' : 'border-gray-100 bg-gray-50'}`}>
                    <span
                      className={`text-sm font-medium capitalize ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                      {agentKey as AgentNameEnum}
                    </span>
                    <span className={valueClass}>
                      {config.provider} / {config.modelName}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(providers).length === 0 && Object.keys(agentModels).length === 0 && (
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {'No configuration received from server yet'}
            </p>
          )}
        </div>
      )}
    </section>
  );
};
