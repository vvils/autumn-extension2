import { useState, useCallback, useSyncExternalStore } from 'react';
import {
  serverSettingsStore,
  DEFAULT_SERVER_SETTINGS,
  integrationSettingsStore,
  DEFAULT_INTEGRATION_SETTINGS,
} from '@extension/storage';
import type { CuratedAction } from '@extension/storage';

interface IntegrationSettingsProps {
  isDarkMode?: boolean;
}

async function serverFetch(path: string, options?: RequestInit): Promise<Response> {
  const { serverUrl, accessToken } = await serverSettingsStore.getSettings();
  const base = serverUrl.replace(/\/+$/, '');
  return fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...options?.headers,
    },
    signal: options?.signal ?? AbortSignal.timeout(10_000),
  });
}

export const IntegrationSettings = ({ isDarkMode = false }: IntegrationSettingsProps) => {
  const serverSnapshot = useSyncExternalStore(serverSettingsStore.subscribe, serverSettingsStore.getSnapshot);
  const settings = serverSnapshot ?? DEFAULT_SERVER_SETTINGS;
  const isAuthenticated = Boolean(settings.accessToken) && settings.tokenExpiresAt > Date.now();

  const integrationSnapshot = useSyncExternalStore(
    integrationSettingsStore.subscribe,
    integrationSettingsStore.getSnapshot,
  );
  const integrationSettings = integrationSnapshot ?? DEFAULT_INTEGRATION_SETTINGS;

  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cardClass = `rounded-lg border ${isDarkMode ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'} p-6 text-left shadow-sm`;
  const headingClass = `mb-4 text-left text-xl font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`;
  const labelClass = `text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`;

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [accountsRes, manifestRes] = await Promise.all([
        serverFetch('/ai/extension/integrations/accounts'),
        serverFetch('/ai/extension/integrations/manifest'),
      ]);
      if (!accountsRes.ok || !manifestRes.ok) {
        throw new Error('Failed to fetch integration data');
      }
      const accounts = await accountsRes.json();
      const manifest = await manifestRes.json();

      const flatActions: CuratedAction[] = [];
      if (manifest.apps) {
        for (const [appSlug, app] of Object.entries(manifest.apps) as [string, { actions: CuratedAction[] }][]) {
          for (const action of app.actions) {
            flatActions.push({ ...action, appSlug });
          }
        }
      }

      await integrationSettingsStore.updateSettings({
        connectedAccounts: accounts.map(
          (a: { id: string; app: { name: string; nameSlug: string }; createdAt: string }) => ({
            accountId: a.id,
            appName: a.app?.name,
            appSlug: a.app?.nameSlug,
            createdAt: new Date(a.createdAt).getTime(),
          }),
        ),
        availableActions: flatActions,
        lastSyncedAt: Date.now(),
      });
    } catch {
      setError('Failed to refresh integrations');
    } finally {
      setRefreshing(false);
    }
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const res = await serverFetch('/ai/extension/integrations/connect-token', { method: 'POST' });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      const connectUrl = data.connectLinkUrl;
      if (!connectUrl) {
        throw new Error('No connect link returned');
      }
      await chrome.tabs.create({ url: connectUrl });
    } catch (err) {
      setError(`Failed to start connection flow: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(
    async (accountId: string) => {
      setDisconnectingId(accountId);
      setError(null);
      try {
        const res = await serverFetch(`/ai/extension/integrations/accounts/${encodeURIComponent(accountId)}`, {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to disconnect account');
        await refresh();
      } catch {
        setError('Failed to disconnect account');
      } finally {
        setDisconnectingId(null);
      }
    },
    [refresh],
  );

  const actionsByApp = groupActionsByApp(integrationSettings.availableActions);

  if (!settings.serverUrl || !isAuthenticated) {
    return (
      <section className="space-y-6">
        <div className={cardClass}>
          <h2 className={headingClass}>{'Integrations'}</h2>
          <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {'Connect to a server and sign in to manage integrations.'}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {error && <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {/* Connected Services */}
      <div className={cardClass}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className={`text-left text-xl font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            {'Connected Services'}
          </h2>
          <button
            onClick={refresh}
            disabled={refreshing}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              isDarkMode
                ? 'bg-slate-600 text-gray-200 hover:bg-slate-500 disabled:opacity-50'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50'
            }`}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {integrationSettings.connectedAccounts.length === 0 ? (
          <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{'No services connected yet.'}</p>
        ) : (
          <div className="space-y-2">
            {integrationSettings.connectedAccounts.map(account => (
              <div
                key={account.accountId}
                className={`flex items-center justify-between rounded-md border px-3 py-2 ${
                  isDarkMode ? 'border-slate-600 bg-slate-700/50' : 'border-gray-100 bg-gray-50'
                }`}>
                <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                  {account.appName || account.appSlug}
                </span>
                <button
                  onClick={() => disconnect(account.accountId)}
                  disabled={disconnectingId === account.accountId}
                  className="rounded-md px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                  {disconnectingId === account.accountId ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Connect a Service */}
      <div className={cardClass}>
        <h2 className={headingClass}>{'Connect a Service'}</h2>
        <p className={`mb-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          {"You'll be redirected to authorize access."}
        </p>
        <button
          onClick={connect}
          disabled={connecting}
          className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
            connecting ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
          } disabled:opacity-50`}>
          {connecting ? 'Connecting...' : 'Connect'}
        </button>
      </div>

      {/* Available Actions */}
      {integrationSettings.availableActions.length > 0 && (
        <div className={cardClass}>
          <h2 className={headingClass}>{'Available Actions'}</h2>
          <div className="space-y-4">
            {Array.from(actionsByApp.entries()).map(([appSlug, actions]) => (
              <div key={appSlug}>
                <h3 className={`mb-2 ${labelClass}`}>{appSlug}</h3>
                <div className="space-y-2">
                  {actions.map(action => (
                    <div
                      key={action.key}
                      className={`rounded-md border px-3 py-2 ${
                        isDarkMode ? 'border-slate-600 bg-slate-700/50' : 'border-gray-100 bg-gray-50'
                      }`}>
                      <p className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                        {action.name}
                      </p>
                      {action.description && (
                        <p className={`mt-0.5 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {action.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

function groupActionsByApp(actions: CuratedAction[]): Map<string, CuratedAction[]> {
  const grouped = new Map<string, CuratedAction[]>();
  for (const action of actions) {
    const existing = grouped.get(action.appSlug);
    if (existing) {
      existing.push(action);
    } else {
      grouped.set(action.appSlug, [action]);
    }
  }
  return grouped;
}
