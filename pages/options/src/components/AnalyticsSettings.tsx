import React, { useState, useEffect } from 'react';
import { analyticsSettingsStore } from '@extension/storage';

import type { AnalyticsSettingsConfig } from '@extension/storage';

interface AnalyticsSettingsProps {
  isDarkMode: boolean;
}

export const AnalyticsSettings: React.FC<AnalyticsSettingsProps> = ({ isDarkMode }) => {
  const [settings, setSettings] = useState<AnalyticsSettingsConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const currentSettings = await analyticsSettingsStore.getSettings();
        setSettings(currentSettings);
      } catch (error) {
        console.error('Failed to load analytics settings:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();

    const unsubscribe = analyticsSettingsStore.subscribe(loadSettings);
    return () => {
      unsubscribe();
    };
  }, []);

  const handleToggleAnalytics = async (enabled: boolean) => {
    if (!settings) return;

    try {
      await analyticsSettingsStore.updateSettings({ enabled });
      setSettings({ ...settings, enabled });
    } catch (error) {
      console.error('Failed to update analytics settings:', error);
    }
  };

  const cardClass =
    'rounded-[20px] bg-white p-6 text-left shadow-[inset_0_1px_1px_#fff,inset_-1px_-1px_1px_#fff,0_0_0_transparent] hover:shadow-[inset_0_1px_1px_#fff,inset_-1px_-1px_1px_#fff,0_4px_12px_rgba(0,0,0,0.08)] transition-shadow duration-500 ease-out';

  if (loading) {
    return (
      <section className="space-y-6">
        <div className={cardClass}>
          <h2 className="mb-4 text-lg font-medium text-black">Analytics Settings</h2>
          <div className="animate-pulse">
            <div className="mb-2 h-4 w-3/4 rounded bg-[#f4f4f4]"></div>
            <div className="h-4 w-1/2 rounded bg-[#f4f4f4]"></div>
          </div>
        </div>
      </section>
    );
  }

  if (!settings) {
    return (
      <section className="space-y-6">
        <div className={cardClass}>
          <h2 className="mb-4 text-lg font-medium text-black">Analytics Settings</h2>
          <p className="text-red-600">Failed to load analytics settings.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className={cardClass}>
        <h2 className="mb-4 text-lg font-medium text-black">Analytics Settings</h2>

        <div className="space-y-6">
          <div className="my-6 rounded-xl bg-[#f4f4f4] p-4">
            <div className="flex items-center justify-between">
              <label htmlFor="analytics-enabled" className="text-[14px] font-medium text-black">
                Help improve Autumn AI Co-Pilot
              </label>
              <div className="relative inline-block w-12 select-none">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={e => handleToggleAnalytics(e.target.checked)}
                  className="sr-only"
                  id="analytics-enabled"
                />
                <label
                  htmlFor="analytics-enabled"
                  className={`block h-6 cursor-pointer overflow-hidden rounded-full ${
                    settings.enabled ? 'bg-accent' : isDarkMode ? 'bg-gray-600' : 'bg-gray-300'
                  }`}>
                  <span className="sr-only">Toggle analytics</span>
                  <span
                    className={`block size-6 rounded-full bg-white shadow transition-transform ${
                      settings.enabled ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </label>
              </div>
            </div>
            <p className="mt-2 text-[13px] text-black/50">
              Share anonymous usage data to help us improve the extension
            </p>
          </div>

          <div className="rounded-xl bg-[#f4f4f4] p-4">
            <h3 className="mb-4 text-[14px] font-medium text-black">What we collect:</h3>
            <ul className="list-disc space-y-2 pl-5 text-left text-sm text-black/60">
              <li>Task execution metrics (start, completion, failure counts and duration)</li>
              <li>Domain names of websites visited (e.g., &quot;amazon.com&quot;, not full URLs)</li>
              <li>Error categories for failed tasks (no sensitive details)</li>
              <li>Anonymous usage statistics</li>
            </ul>

            <h3 className="mb-4 mt-6 text-[14px] font-medium text-black">What we DON&apos;T collect:</h3>
            <ul className="list-disc space-y-2 pl-5 text-left text-sm text-black/60">
              <li>Personal information or login credentials</li>
              <li>Full URLs or page content</li>
              <li>Task instructions or user prompts</li>
              <li>Screen recordings or screenshots</li>
              <li>Any sensitive or private data</li>
            </ul>
          </div>

          {!settings.enabled && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
              <p className="text-sm text-yellow-700">
                Analytics disabled. You can re-enable it anytime to help improve Autumn AI Co-Pilot.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
