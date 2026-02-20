import { useState } from 'react';
import '@src/Options.css';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { FiSettings, FiShield, FiTrendingUp, FiServer, FiLink, FiZap } from 'react-icons/fi';
import { GeneralSettings } from './components/GeneralSettings';
import { FirewallSettings } from './components/FirewallSettings';
import { AnalyticsSettings } from './components/AnalyticsSettings';
import { ServerSettings } from './components/ServerSettings';
import { IntegrationSettings } from './components/IntegrationSettings';
import { ShortcutSettings } from './components/ShortcutSettings';

type TabTypes = 'general' | 'firewall' | 'analytics' | 'server' | 'integrations' | 'shortcuts';

const TABS: { id: TabTypes; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { id: 'server', icon: FiServer, label: 'Server' },
  { id: 'integrations', icon: FiLink, label: 'Integrations' },
  { id: 'shortcuts', icon: FiZap, label: 'Shortcuts' },
  { id: 'general', icon: FiSettings, label: 'General' },
  { id: 'firewall', icon: FiShield, label: 'Firewall' },
  { id: 'analytics', icon: FiTrendingUp, label: 'Analytics' },
];

const Options = () => {
  const [activeTab, setActiveTab] = useState<TabTypes>('server');
  const isDarkMode = false;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSettings isDarkMode={isDarkMode} />;
      case 'firewall':
        return <FirewallSettings isDarkMode={isDarkMode} />;
      case 'analytics':
        return <AnalyticsSettings isDarkMode={isDarkMode} />;
      case 'server':
        return <ServerSettings isDarkMode={isDarkMode} />;
      case 'integrations':
        return <IntegrationSettings isDarkMode={isDarkMode} />;
      case 'shortcuts':
        return <ShortcutSettings isDarkMode={isDarkMode} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen min-w-[768px] bg-[#f4f4f4] text-gray-900">
      <nav className="w-48">
        <div className="p-4">
          <h1 className="mb-6 text-xl font-bold text-black">{'Settings'}</h1>
          <ul className="space-y-0.5">
            {TABS.map(item => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[14px] font-medium transition-all duration-200 ${
                    activeTab === item.id ? 'text-black' : 'text-black/30 hover:text-black/70'
                  }`}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <main className="flex-1 p-8">
        <div className="mx-auto min-w-[512px] max-w-screen-lg">{renderTabContent()}</div>
      </main>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Options, <div>Loading...</div>), <div>Error Occurred</div>);
