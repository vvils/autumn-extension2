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
import { FiBox, FiChevronRight, FiPlus } from 'react-icons/fi';

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

const APP_LOGOS: Record<string, string> = {
  gmail: 'https://assets.pipedream.net/s.v0/app_OQYhq7/logo/orig',
  'google-calendar': 'https://assets.pipedream.net/s.v0/app_13Gh2V/logo/orig',
};

const APP_DESCRIPTIONS: Record<string, string> = {
  gmail: 'Read, send, and manage your email messages',
  'google-calendar': 'Create events and manage your calendar',
};

type AppCategory = 'Communications' | 'Productivity' | 'Operations';

const APP_CATEGORIES: Record<string, AppCategory> = {
  gmail: 'Communications',
  'google-calendar': 'Productivity',
};

const CATEGORY_ORDER: AppCategory[] = ['Communications', 'Productivity', 'Operations'];

const FALLBACK_ICON: IconType = FiBox;

function AppIcon({ appSlug, size = 'sm' }: { appSlug: string; size?: 'sm' | 'lg' }) {
  const logoUrl = APP_LOGOS[appSlug];
  const px = size === 'lg' ? 48 : 24;

  if (logoUrl) {
    return <img src={logoUrl} alt="" width={px} height={px} className="shrink-0 rounded" />;
  }

  const Icon = FALLBACK_ICON;
  const wrapperClass = size === 'lg' ? 'h-12 w-12' : 'h-6 w-6';
  const iconClass = size === 'lg' ? 'h-6 w-6' : 'h-4 w-4';
  return (
    <div className={`${wrapperClass} flex shrink-0 items-center justify-center rounded-xl bg-[#f4f4f4]`}>
      <Icon className={`${iconClass} text-black/60`} />
    </div>
  );
}

function AppTile({ app, onClick, showPlus }: { app: AppCard; onClick: () => void; showPlus?: boolean }) {
  const subtitle =
    APP_DESCRIPTIONS[app.appSlug] ??
    app.actions[0]?.description ??
    `${app.actions.length} ${app.actions.length === 1 ? 'action' : 'actions'}`;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        filter: 'drop-shadow(rgba(0,0,0,0.07) 0px 0.5px 0.5px) drop-shadow(rgba(0,0,0,0.06) 0px 1px 2px)',
      }}
      className="h-[188px] w-52 flex-shrink-0 text-left transition-shadow duration-300 hover:shadow-md rounded-[24px]">
      <div className="flex h-full w-full flex-col justify-between rounded-[24px] bg-white p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,1),inset_-1px_-1px_1px_rgba(255,255,255,1)]">
        <div className="flex items-start justify-between">
          <AppIcon appSlug={app.appSlug} />
          {showPlus && (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/5">
              <FiPlus className="h-4 w-4 text-black/40" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-md font-medium text-black">{app.appName}</p>
          <p className="line-clamp-2 text-xs text-neutral-500">{subtitle}</p>
        </div>
      </div>
    </button>
  );
}

// --- Server fetch ---

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

    const allSlugs = new Set([...accountsBySlug.keys(), ...actionsBySlug.keys(), ...Object.keys(APP_LOGOS)]);
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

  // --- Callbacks ---

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

  // --- Auth gate ---

  if (!settings.serverUrl || !isAuthenticated) {
    return (
      <section className="mt-12">
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
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-black/50">Actions</h3>
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
    <div>
      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <section className="mt-12">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-black">Active</h2>
            <p className="py-0.5 text-sm text-black/50">Your connected services</p>
          </div>
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
          <div className="relative">
            <div className="flex gap-4 overflow-x-auto pb-2">
              {activeApps.map(app => (
                <AppTile key={app.appSlug} app={app} onClick={() => setSelectedApp(app.appSlug)} />
              ))}
            </div>
            <div className="pointer-events-none absolute bottom-0 right-0 top-0 w-12 bg-gradient-to-l from-[#f4f4f4] to-transparent" />
          </div>
        )}
      </section>

      {exploreApps.length > 0 && (
        <section className="mt-12">
          <div className="mb-8">
            <h2 className="text-lg font-medium text-black">Explore</h2>
            <p className="py-0.5 text-sm text-black/50">Enable more Abilities to extend Dex&apos;s capabilities</p>
          </div>
          <div className="space-y-8">
            {CATEGORY_ORDER.map(category => {
              const categoryApps = exploreApps.filter(a => APP_CATEGORIES[a.appSlug] === category);
              if (categoryApps.length === 0) return null;
              return (
                <div key={category}>
                  <h3 className="mb-4 text-sm font-medium text-black/40">{category}</h3>
                  <div className="relative">
                    <div className="flex gap-4 overflow-x-auto pb-2">
                      {categoryApps.map(app => (
                        <AppTile key={app.appSlug} app={app} onClick={() => setSelectedApp(app.appSlug)} showPlus />
                      ))}
                    </div>
                    <div className="pointer-events-none absolute bottom-0 right-0 top-0 w-12 bg-gradient-to-l from-[#f4f4f4] to-transparent" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
