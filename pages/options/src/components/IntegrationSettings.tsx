import { useState, useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  serverSettingsStore,
  DEFAULT_SERVER_SETTINGS,
  integrationSettingsStore,
  DEFAULT_INTEGRATION_SETTINGS,
} from '@extension/storage';
import type { CuratedAction } from '@extension/storage';
import { createFrontendClient } from '@pipedream/sdk/browser';

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
  const [connectingApp, setConnectingApp] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cardClass =
    'rounded-[20px] bg-white p-6 text-left shadow-[inset_0_1px_1px_#fff,inset_-1px_-1px_1px_#fff,0_0_0_transparent] hover:shadow-[inset_0_1px_1px_#fff,inset_-1px_-1px_1px_#fff,0_4px_12px_rgba(0,0,0,0.08)] transition-shadow duration-500 ease-out';
  const headingClass = 'mb-4 text-left text-lg font-medium text-black';
  const labelClass = `text-xs font-medium uppercase tracking-wider ${isDarkMode ? 'text-gray-400' : 'text-black/50'}`;

  const connectedAppSlugs = useMemo(
    () => new Set(integrationSettings.connectedAccounts.map(a => a.appSlug)),
    [integrationSettings.connectedAccounts],
  );

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

  const connectApp = useCallback(
    async (appSlug: string) => {
      setConnectingApp(appSlug);
      setError(null);
      try {
        const { userId } = await serverSettingsStore.getSettings();
        if (!userId) throw new Error('Not authenticated');

        const pd = createFrontendClient({
          externalUserId: userId,
          tokenCallback: async () => {
            const res = await serverFetch('/ai/extension/integrations/connect-token', { method: 'POST' });
            if (!res.ok) throw new Error(`Server returned ${res.status}`);
            return res.json();
          },
        });
        pd.connectAccount({
          app: appSlug,
          onSuccess: async () => {
            setConnectingApp(null);
            await refresh();
          },
          onError: (err: Error) => {
            setError(`Connection failed: ${err.message}`);
            setConnectingApp(null);
          },
        });
      } catch (err) {
        setError(`Failed to start connection: ${err instanceof Error ? err.message : 'unknown error'}`);
        setConnectingApp(null);
      }
    },
    [refresh],
  );

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
          <p className="text-sm text-black/40">{'Connect to a server and sign in to manage integrations.'}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className={cardClass}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-left text-lg font-medium text-black">{'Connected Services'}</h2>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="rounded-lg bg-neutral-200 px-3 py-1.5 text-xs font-medium text-black/70 transition-colors hover:bg-neutral-300 disabled:opacity-50">
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {integrationSettings.connectedAccounts.length === 0 ? (
          <p className="text-sm text-black/40">{'No services connected yet.'}</p>
        ) : (
          <div className="space-y-2">
            {integrationSettings.connectedAccounts.map(account => (
              <div
                key={account.accountId}
                className="flex items-center justify-between rounded-xl bg-[#f4f4f4] px-3 py-2.5">
                <span className="text-sm font-medium text-black">{account.appName || account.appSlug}</span>
                <button
                  onClick={() => disconnect(account.accountId)}
                  disabled={disconnectingId === account.accountId}
                  className="rounded-lg px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50">
                  {disconnectingId === account.accountId ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {integrationSettings.availableActions.length > 0 && (
        <div className={cardClass}>
          <h2 className={headingClass}>{'Available Actions'}</h2>
          <div className="space-y-4">
            {Array.from(actionsByApp.entries()).map(([appSlug, actions]) => (
              <div key={appSlug}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className={labelClass}>{appSlug}</h3>
                  {connectedAppSlugs.has(appSlug) ? (
                    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                      {'Connected'}
                    </span>
                  ) : (
                    <button
                      onClick={() => connectApp(appSlug)}
                      disabled={connectingApp !== null}
                      className={`rounded-lg px-3 py-1 text-xs font-medium text-white transition-colors ${
                        connectingApp === appSlug ? 'bg-black/60' : 'bg-black hover:bg-black/90'
                      } disabled:opacity-50`}>
                      {connectingApp === appSlug ? 'Connecting...' : 'Connect'}
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {actions.map(action => (
                    <div key={action.key} className="rounded-xl bg-[#f4f4f4] px-3 py-2.5">
                      <p className="text-sm font-medium text-black">{action.name}</p>
                      {action.description && <p className="mt-0.5 text-xs text-black/50">{action.description}</p>}
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
