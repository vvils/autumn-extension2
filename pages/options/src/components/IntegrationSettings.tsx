import { useState, useCallback, useMemo, useRef, useEffect, useSyncExternalStore } from 'react';
import {
  serverSettingsStore,
  DEFAULT_SERVER_SETTINGS,
  integrationSettingsStore,
  DEFAULT_INTEGRATION_SETTINGS,
  isTokenValid,
} from '@extension/storage';
import type { CuratedAction } from '@extension/storage';
import { serverFetch } from '@extension/shared';
import { createFrontendClient } from '@pipedream/sdk/browser';
import type { IconType } from 'react-icons';
import { FiBox, FiPlus } from 'react-icons/fi';

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
};

const APP_DESCRIPTIONS: Record<string, string> = {
  gmail: 'Read, send, and manage your email messages',
};

type AppCategory = 'Communications' | 'Productivity' | 'Operations';

const APP_CATEGORIES: Record<string, AppCategory> = {
  gmail: 'Communications',
};

const CATEGORY_ORDER: AppCategory[] = ['Communications', 'Productivity', 'Operations'];

const FALLBACK_ICON: IconType = FiBox;

// --- Squircle clip-path ---

function buildSquirclePath(w: number, h: number): string {
  const r = h / 2;
  const c1 = 0.2361;
  const c2 = 1.4166;
  const c3 = 2.8158;
  const c4 = 0.2216;
  const a = 14.9626;

  return [
    `M ${w - r} 0`,
    `c ${c1} 0 ${c2} 0 ${c3} ${c4}`,
    `a ${r} ${r} 0 0 1 ${a} ${a}`,
    `c ${c4} ${c2 - 0.0174} ${c4} ${c3 - 0.2361} ${c4} ${c3}`,
    `L ${w} ${r}`,
    `c 0 ${c1} 0 ${c2} -${c4} ${c3}`,
    `a ${r} ${r} 0 0 1 -${a} ${a}`,
    `c -${c2 - 0.0174} ${c4} -${c3 - 0.2361} ${c4} -${c3} ${c4}`,
    `L ${r} ${h}`,
    `c -${c1} 0 -${c2} 0 -${c3} -${c4}`,
    `a ${r} ${r} 0 0 1 -${a} -${a}`,
    `c -${c4} -${c2 - 0.0174} -${c4} -${c3 - 0.2361} -${c4} -${c3}`,
    `L 0 ${r}`,
    `c 0 -${c1} 0 -${c2} ${c4} -${c3}`,
    `a ${r} ${r} 0 0 1 ${a} -${a}`,
    `c ${c2 - 0.0174} -${c4} ${c3 - 0.2361} -${c4} ${c3} -${c4}`,
    'Z',
  ].join(' ');
}

function SquirclePill({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [clipPath, setClipPath] = useState<string>('');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      setClipPath(`path("${buildSquirclePath(Math.round(width), Math.round(height))}")`);
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <h2
      ref={ref}
      className="mb-3.5 inline-block bg-neutral-200/30 px-4 py-1.5 text-[15px] text-neutral-900"
      style={{ clipPath: clipPath || undefined }}>
      {children}
    </h2>
  );
}

// --- Components ---

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
    <div className={`${wrapperClass} flex shrink-0 items-center justify-center rounded-xl bg-neutral-100`}>
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
      className="h-[188px] w-52 shrink-0 rounded-[24px] text-left transition-shadow duration-300 hover:shadow-md">
      <div className="flex size-full flex-col justify-between rounded-[24px] bg-white p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,1),inset_-1px_-1px_1px_rgba(255,255,255,1)]">
        <div className="flex items-start justify-between">
          <div className="mr-0.5 mt-1 flex size-6 shrink-0 items-center justify-center">
            <AppIcon appSlug={app.appSlug} />
          </div>
          {showPlus && (
            <div className="-mr-0.5 mt-[-3px] flex size-10 items-center justify-center rounded-full bg-black/5 transition-colors hover:bg-black/10">
              <FiPlus className="size-4 text-neutral-800" strokeWidth={1.8} />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-black">{app.appName}</p>
          <p className="line-clamp-2 text-xs leading-tight text-neutral-500">{subtitle}</p>
        </div>
      </div>
    </button>
  );
}

// --- Main component ---

export const IntegrationSettings = () => {
  const serverSnapshot = useSyncExternalStore(serverSettingsStore.subscribe, serverSettingsStore.getSnapshot);
  const settings = serverSnapshot ?? DEFAULT_SERVER_SETTINGS;
  const isAuthenticated = isTokenValid(settings);

  const integrationSnapshot = useSyncExternalStore(
    integrationSettingsStore.subscribe,
    integrationSettingsStore.getSnapshot,
  );
  const integrationSettings = integrationSnapshot ?? DEFAULT_INTEGRATION_SETTINGS;

  const [connectingApp, setConnectingApp] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);

  const cardClass =
    'rounded-[20px] bg-white p-6 text-left shadow-[inset_0_1px_1px_#fff,inset_-1px_-1px_1px_#fff,0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[inset_0_1px_1px_#fff,inset_-1px_-1px_1px_#fff,0_4px_12px_rgba(0,0,0,0.08)] transition-shadow duration-500 ease-out';

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
      <div key="auth" className="animate-fadeIn">
        <section className="mt-12">
          <div className={cardClass}>
            <h2 className="mb-4 text-left text-lg font-medium text-black">{'Integrations'}</h2>
            <p className="text-sm text-black/40">{'Connect to a server and sign in to manage integrations.'}</p>
          </div>
        </section>
      </div>
    );
  }

  // --- Detail view ---

  if (selectedAppData) {
    const description =
      APP_DESCRIPTIONS[selectedAppData.appSlug] ??
      selectedAppData.actions[0]?.description ??
      `${selectedAppData.actions.length} available ${selectedAppData.actions.length === 1 ? 'action' : 'actions'}`;
    const logoUrl = APP_LOGOS[selectedAppData.appSlug];

    return (
      <div key={selectedApp} className="animate-fadeIn">
        <section className="mt-6">
          {error && <div className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}

          <nav className="mb-10 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSelectedApp(null)}
              className="flex items-center gap-2 rounded-md px-2.5 py-1 opacity-60 transition-opacity hover:opacity-80">
              <span className="whitespace-nowrap text-sm font-medium tracking-[0.15px] text-black">Integrations</span>
            </button>
            <div className="flex h-6 items-center justify-center">
              <span className="text-base font-normal tracking-[0.16px] text-black/20">/</span>
            </div>
            <div className="flex items-center gap-2 rounded-md px-2.5 py-1 opacity-80">
              <AppIcon appSlug={selectedAppData.appSlug} />
              <span className="whitespace-nowrap text-[15px] font-medium tracking-[0.15px] text-black">
                {selectedAppData.appName}
              </span>
            </div>
          </nav>

          <div className="mb-10">
            <div className="flex w-full justify-between gap-10 px-2">
              <div className="flex flex-col items-start gap-4">
                <div className="flex flex-col items-start gap-3.5">
                  {logoUrl ? (
                    <img src={logoUrl} alt="" width={36} height={36} className="size-9 shrink-0 rounded" />
                  ) : (
                    <div className="flex size-9 items-center justify-center rounded-xl bg-neutral-100">
                      <FiBox className="size-5 text-black/60" />
                    </div>
                  )}
                  <h1 className="text-[32px] font-medium tracking-[-0.32px] text-black">{selectedAppData.appName}</h1>
                </div>
                <p className="text-sm leading-relaxed text-balance text-black/50">{description}</p>
              </div>
              <div className="flex items-end">
                {selectedAppData.isConnected ? (
                  <button
                    type="button"
                    onClick={() => selectedAppData.accountId && disconnect(selectedAppData.accountId)}
                    disabled={disconnectingId === selectedAppData.accountId}
                    className="h-10 rounded-[20px] bg-neutral-200 px-6 text-base text-neutral-700 transition-colors hover:bg-neutral-300 disabled:opacity-50">
                    {disconnectingId === selectedAppData.accountId ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => connectApp(selectedAppData.appSlug)}
                    disabled={connectingApp !== null}
                    className="h-10 rounded-[20px] bg-black px-6 text-base text-white transition-colors hover:bg-black/90 disabled:opacity-50">
                    {connectingApp === selectedAppData.appSlug ? 'Connecting...' : 'Connect'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {selectedAppData.actions.length > 0 && (
            <div className="px-2">
              <SquirclePill>Tools ({selectedAppData.actions.length})</SquirclePill>
              <div className="grid w-full grid-cols-1 gap-4">
                {selectedAppData.actions.map(action => (
                  <div
                    key={action.key}
                    className="w-full"
                    style={{
                      filter: 'drop-shadow(rgba(0,0,0,0.07) 0px 0.5px 0.5px) drop-shadow(rgba(0,0,0,0.06) 0px 1px 2px)',
                    }}>
                    <div className="w-full rounded-[20px] bg-white shadow-[inset_0_1px_1px_rgba(255,255,255,1),inset_-1px_-1px_1px_rgba(255,255,255,1)]">
                      <div className="px-5 pb-1 pt-5">
                        <div className="truncate text-[14px] font-medium">{action.name}</div>
                      </div>
                      {action.description && (
                        <div className="px-5 pb-5 pt-0 text-[13px] leading-normal text-black/70">
                          {action.description}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    );
  }

  // --- Cards view ---

  return (
    <div key="list" className="animate-fadeIn">
      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {activeApps.length > 0 && (
        <section className="mt-12">
          <div className="mb-6">
            <h2 className="text-lg font-medium text-black">Active</h2>
            <p className="py-0.5 text-sm text-black/50">Your connected services</p>
          </div>
          <div className="relative">
            <div className="scrollbar-hide -m-1 flex gap-4 overflow-x-auto overflow-y-visible p-1">
              {activeApps.map(app => (
                <AppTile key={app.appSlug} app={app} onClick={() => setSelectedApp(app.appSlug)} />
              ))}
            </div>
            <div
              className="pointer-events-none absolute inset-y-0 -right-4 z-10 w-12"
              style={{
                backgroundImage: 'linear-gradient(to left, white 0%, white 25%, transparent 100%)',
              }}
            />
          </div>
        </section>
      )}

      {exploreApps.length > 0 && (
        <section className="mt-12">
          <div className="mb-6">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-medium text-black">Explore</h2>
              <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-black/40">
                More coming soon
              </span>
            </div>
            <p className="py-0.5 text-sm text-black/50">Enable more integrations to extend your capabilities</p>
          </div>
          <div className="mt-8 space-y-8">
            {CATEGORY_ORDER.map(category => {
              const categoryApps = exploreApps.filter(a => APP_CATEGORIES[a.appSlug] === category);
              if (categoryApps.length === 0) return null;
              return (
                <div key={category}>
                  <SquirclePill>{category}</SquirclePill>
                  <div className="relative">
                    <div className="scrollbar-hide -m-1 flex gap-4 overflow-x-auto overflow-y-visible p-1">
                      {categoryApps.map(app => (
                        <AppTile key={app.appSlug} app={app} onClick={() => setSelectedApp(app.appSlug)} showPlus />
                      ))}
                    </div>
                    <div
                      className="pointer-events-none absolute inset-y-0 -right-4 z-10 w-12"
                      style={{
                        backgroundImage: 'linear-gradient(to left, white 0%, white 25%, transparent 100%)',
                      }}
                    />
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
