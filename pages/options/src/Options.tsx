import { useCallback, useEffect, useState } from 'react';
import '@src/Options.css';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { GeneralSettings } from './components/GeneralSettings';
import { FirewallSettings } from './components/FirewallSettings';
import { ServerSettings } from './components/ServerSettings';
import { IntegrationSettings } from './components/IntegrationSettings';
import { ShortcutSettings } from './components/ShortcutSettings';

type TabTypes = 'general' | 'firewall' | 'server' | 'integrations' | 'shortcuts';

const ALL_TABS: { id: TabTypes; label: string; title: string; subtitle: string; devOnly?: boolean }[] = [
  { id: 'server', label: 'Server', title: 'Server', subtitle: 'Connection and model configuration', devOnly: true },
  {
    id: 'integrations',
    label: 'Integrations',
    title: 'Integrations',
    subtitle: 'Connect services and manage abilities',
  },
  { id: 'shortcuts', label: 'Shortcuts', title: 'Shortcuts', subtitle: 'Custom commands for quick actions' },
  {
    id: 'general',
    label: 'General',
    title: 'General',
    subtitle: 'Agent behavior and display preferences',
    devOnly: true,
  },
  {
    id: 'firewall',
    label: 'Firewall',
    title: 'Firewall',
    subtitle: 'URL access control and domain filtering',
    devOnly: true,
  },
];

const TABS = ALL_TABS.filter(t => !t.devOnly || import.meta.env.DEV);
const TAB_IDS = new Set<string>(TABS.map(t => t.id));

function getTabFromHash(): TabTypes {
  const hash = window.location.hash.slice(1);
  return TAB_IDS.has(hash) ? (hash as TabTypes) : TABS[0].id;
}

const Options = () => {
  const [activeTab, setActiveTab] = useState<TabTypes>(getTabFromHash);

  const switchTab = useCallback((tab: TabTypes) => {
    setActiveTab(tab);
    window.location.hash = tab;
  }, []);

  useEffect(() => {
    const onHashChange = () => setActiveTab(getTabFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const isDarkMode = false;
  const currentTab = TABS.find(t => t.id === activeTab)!;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSettings isDarkMode={isDarkMode} />;
      case 'firewall':
        return <FirewallSettings isDarkMode={isDarkMode} />;
      case 'server':
        return <ServerSettings isDarkMode={isDarkMode} />;
      case 'integrations':
        return <IntegrationSettings />;
      case 'shortcuts':
        return <ShortcutSettings isDarkMode={isDarkMode} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-white text-gray-900">
      <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-8 lg:max-w-4xl xl:max-w-6xl 2xl:max-w-6xl">
          <div className="scrollbar-hide flex items-center gap-4 overflow-x-auto py-4">
            {TABS.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => switchTab(item.id)}
                className={`whitespace-nowrap rounded-md p-2 text-[15px] font-medium transition-all duration-200 ${
                  activeTab === item.id ? 'text-black' : 'text-black/20 hover:text-black/80'
                }`}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-8 pb-14 pt-8 lg:max-w-4xl xl:max-w-6xl 2xl:max-w-6xl">
          <div className="pb-2">
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold leading-tight text-black">{currentTab.title}</h1>
              <p className="py-0.5 text-sm text-black/50">{currentTab.subtitle}</p>
            </div>
          </div>
          {renderTabContent()}
        </div>
      </main>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Options, <div>Loading...</div>), <div>Error Occurred</div>);
