import { useState } from 'react';
import '@src/Options.css';
import { Button } from '@extension/ui';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { FiSettings, FiShield, FiTrendingUp, FiServer } from 'react-icons/fi';
import { GeneralSettings } from './components/GeneralSettings';
import { FirewallSettings } from './components/FirewallSettings';
import { AnalyticsSettings } from './components/AnalyticsSettings';
import { ServerSettings } from './components/ServerSettings';

type TabTypes = 'general' | 'firewall' | 'analytics' | 'server';

const TABS: { id: TabTypes; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { id: 'server', icon: FiServer, label: 'Server' },
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
      default:
        return null;
    }
  };

  return (
    <div
      className={`flex min-h-screen min-w-[768px] ${isDarkMode ? 'bg-slate-900 text-gray-200' : 'bg-gray-50 text-gray-900'}`}>
      {/* Vertical Navigation Bar */}
      <nav className={`w-48 border-r ${isDarkMode ? 'border-slate-700 bg-slate-800/80' : 'border-gray-200 bg-white'}`}>
        <div className="p-4">
          <h1 className={`mb-6 text-xl font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{'Settings'}</h1>
          <ul className="space-y-1">
            {TABS.map(item => (
              <li key={item.id}>
                <Button
                  onClick={() => setActiveTab(item.id)}
                  className={`flex w-full items-center space-x-2 rounded-lg px-4 py-2 text-left text-base
                    ${
                      activeTab !== item.id
                        ? `${isDarkMode ? 'bg-slate-700/70 text-gray-300 hover:text-white' : 'bg-transparent font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`
                        : `${isDarkMode ? 'bg-accent-foreground/50' : ''} text-white`
                    }`}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className={`flex-1 ${isDarkMode ? 'bg-slate-800/50' : ''} p-8`}>
        <div className="mx-auto min-w-[512px] max-w-screen-lg">{renderTabContent()}</div>
      </main>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Options, <div>Loading...</div>), <div>Error Occurred</div>);
