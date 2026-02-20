import { useState, useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  serverSettingsStore,
  DEFAULT_SERVER_SETTINGS,
  integrationSettingsStore,
  DEFAULT_INTEGRATION_SETTINGS,
} from '@extension/storage';
import type { CuratedAction } from '@extension/storage';
import { createFrontendClient } from '@pipedream/sdk/browser';
import type { IconType } from 'react-icons';
import {
  FiMail,
  FiCalendar,
  FiFileText,
  FiMessageSquare,
  FiGrid,
  FiDatabase,
  FiTrello,
  FiGithub,
  FiSlack,
  FiBox,
  FiChevronRight,
} from 'react-icons/fi';

// --- Types ---

interface AppCard {
  appSlug: string;
  appName: string;
  isConnected: boolean;
  accountId: string | null;
  actions: CuratedAction[];
}

// --- Helpers ---

function formatSlug(slug: string): string {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const APP_ICONS: Record<string, IconType> = {
  gmail: FiMail,
  'google-calendar': FiCalendar,
  'google-sheets': FiGrid,
  'google-docs': FiFileText,
  slack: FiSlack,
  github: FiGithub,
  trello: FiTrello,
  notion: FiFileText,
  airtable: FiDatabase,
  discord: FiMessageSquare,
};

function AppIcon({ appSlug, size = 'sm' }: { appSlug: string; size?: 'sm' | 'lg' }) {
  const Icon = APP_ICONS[appSlug] ?? FiBox;
  const px = size === 'lg' ? 'h-12 w-12' : 'h-9 w-9';
  const iconSize = size === 'lg' ? 'h-6 w-6' : 'h-4 w-4';
  return (
    <div className={`${px} flex shrink-0 items-center justify-center rounded-xl bg-[#f4f4f4]`}>
      <Icon className={`${iconSize} text-black/60`} />
    </div>
  );
}

function AppTile({ app, onClick }: { app: AppCard; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex items-center gap-3 rounded-[16px] bg-white px-4 py-3.5 text-left shadow-[inset_0_1px_1px_#fff,inset_-1px_-1px_1px_#fff,0_0_0_transparent] transition-shadow duration-300 hover:shadow-[inset_0_1px_1px_#fff,inset_-1px_-1px_1px_#fff,0_4px_12px_rgba(0,0,0,0.08)]">
      <AppIcon appSlug={app.appSlug} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-black">{app.appName}</p>
        <p className="text-xs text-black/40">
          {app.actions.length} {app.actions.length === 1 ? 'action' : 'actions'}
        </p>
      </div>
      {app.isConnected && <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-green-500" />}
      <FiChevronRight className="h-4 w-4 shrink-0 text-black/20" />
    </button>
  );
}

// --- Server fetch (unchanged) ---

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

// --- Main component ---

export const IntegrationSettings = ({ isDarkMode: _isDarkMode = false }: IntegrationSettingsProps) => {
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
  const [selectedApp, setSelectedApp] = useState<string | null>(null);

  const cardClass =
    'rounded-[20px] bg-white p-6 text-left shadow-[inset_0_1px_1px_#fff,inset_-1px_-1px_1px_#fff,0_0_0_transparent] hover:shadow-[inset_0_1px_1px_#fff,inset_-1px_-1px_1px_#fff,0_4px_12px_rgba(0,0,0,0.08)] transition-shadow duration-500 ease-out';
  const labelClass = 'text-xs font-medium uppercase tracking-wider text-black/50';

  // --- Data derivation ---

  const appCards = useMemo<AppCard[]>(() => {
    const accountsBySlug = new Map<string, { accountId: string; appName: string }>();
    for (const acct of integrationSettings.connectedAccounts) {
      accountsBySlug.set(acct.appSlug, { accountId: acct.accountId, appName: acct.appName });
    }

    const actionsBySlug = new Map<string, CuratedAction[]>();
    for (const action of integrationSettings.availableActions) {
      const existing = actionsBySlug.get(action.appSlug);
      if (existing) existing.push(action);
      else actionsBySlug.set(action.appSlug, [action]);
    }

    const allSlugs = new Set([...accountsBySlug.keys(), ...actionsBySlug.keys()]);
    return Array.from(allSlugs).map(slug => {
      const account = accountsBySlug.get(slug);
      return {
        appSlug: slug,
        appName: account?.appName || formatSlug(slug),
        isConnected: accountsBySlug.has(slug),
        accountId: account?.accountId ?? null,
        actions: actionsBySlug.get(slug) ?? [],
      };
    });
  }, [integrationSettings.connectedAccounts, integrationSettings.availableActions]);

  const activeApps = useMemo(() => appCards.filter(a => a.isConnected), [appCards]);
  const exploreApps = useMemo(() => appCards.filter(a => !a.isConnected), [appCards]);
  const selectedAppData = useMemo(() => appCards.find(a => a.appSlug === selectedApp) ?? null, [appCards, selectedApp]);

  // --- Callbacks (unchanged) ---

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

  // --- Auth gate (unchanged) ---

  if (!settings.serverUrl || !isAuthenticated) {
    return (
      <section className="space-y-6">
        <div className={cardClass}>
          <h2 className="mb-4 text-left text-lg font-medium text-black">{'Integrations'}</h2>
          <p className="text-sm text-black/40">{'Connect to a server and sign in to manage integrations.'}</p>
        </div>
      </section>
    );
  }

  // --- Detail view ---

  if (selectedAppData) {
    return (
      <section className="space-y-6">
        {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <div className="flex items-center gap-1.5 text-sm">
          <button
            type="button"
            onClick={() => setSelectedApp(null)}
            className="font-medium text-black/40 transition-colors hover:text-black/70">
            Integrations
          </button>
          <FiChevronRight className="h-3.5 w-3.5 text-black/30" />
          <span className="font-medium text-black">{selectedAppData.appName}</span>
        </div>

        <div className={cardClass}>
          <div className="flex items-center gap-4">
            <AppIcon appSlug={selectedAppData.appSlug} size="lg" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-medium text-black">{selectedAppData.appName}</h2>
              <p className="text-sm text-black/40">
                {selectedAppData.actions.length} available {selectedAppData.actions.length === 1 ? 'action' : 'actions'}
              </p>
            </div>
            {selectedAppData.isConnected && (
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                Connected
              </span>
            )}
          </div>
        </div>

        {selectedAppData.actions.length > 0 && (
          <div className={cardClass}>
            <h3 className={`${labelClass} mb-3`}>Actions</h3>
            <div className="space-y-2">
              {selectedAppData.actions.map(action => (
                <div key={action.key} className="rounded-xl bg-[#f4f4f4] px-3 py-2.5">
                  <p className="text-sm font-medium text-black">{action.name}</p>
                  {action.description && <p className="mt-0.5 text-xs text-black/50">{action.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          {selectedAppData.isConnected ? (
            <button
              type="button"
              onClick={() => selectedAppData.accountId && disconnect(selectedAppData.accountId)}
              disabled={disconnectingId === selectedAppData.accountId}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50">
              {disconnectingId === selectedAppData.accountId ? 'Disconnecting...' : 'Disconnect'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => connectApp(selectedAppData.appSlug)}
              disabled={connectingApp !== null}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black/90 disabled:opacity-50">
              {connectingApp === selectedAppData.appSlug ? 'Connecting...' : 'Connect'}
            </button>
          )}
        </div>
      </section>
    );
  }

  // --- Cards view ---

  return (
    <section className="space-y-6">
      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className={labelClass}>Active</h2>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="rounded-lg bg-neutral-200 px-3 py-1.5 text-xs font-medium text-black/70 transition-colors hover:bg-neutral-300 disabled:opacity-50">
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        {activeApps.length === 0 ? (
          <p className="text-sm text-black/40">No services connected yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {activeApps.map(app => (
              <AppTile key={app.appSlug} app={app} onClick={() => setSelectedApp(app.appSlug)} />
            ))}
          </div>
        )}
      </div>

      {exploreApps.length > 0 && (
        <div>
          <h2 className={`${labelClass} mb-3`}>Explore</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {exploreApps.map(app => (
              <AppTile key={app.appSlug} app={app} onClick={() => setSelectedApp(app.appSlug)} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
