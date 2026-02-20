import { useState, useEffect, useCallback } from 'react';
import { firewallStore } from '@extension/storage';
interface FirewallSettingsProps {
  isDarkMode: boolean;
}

export const FirewallSettings = ({ isDarkMode }: FirewallSettingsProps) => {
  const [isEnabled, setIsEnabled] = useState(true);
  const [allowList, setAllowList] = useState<string[]>([]);
  const [denyList, setDenyList] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [activeList, setActiveList] = useState<'allow' | 'deny'>('allow');

  const loadFirewallSettings = useCallback(async () => {
    const settings = await firewallStore.getFirewall();
    setIsEnabled(settings.enabled);
    setAllowList(settings.allowList);
    setDenyList(settings.denyList);
  }, []);

  useEffect(() => {
    loadFirewallSettings();
  }, [loadFirewallSettings]);

  const handleToggleFirewall = async () => {
    await firewallStore.updateFirewall({ enabled: !isEnabled });
    await loadFirewallSettings();
  };

  const handleAddUrl = async () => {
    const cleanUrl = newUrl.trim().replace(/^https?:\/\//, '');
    if (!cleanUrl) return;

    if (activeList === 'allow') {
      await firewallStore.addToAllowList(cleanUrl);
    } else {
      await firewallStore.addToDenyList(cleanUrl);
    }
    await loadFirewallSettings();
    setNewUrl('');
  };

  const handleRemoveUrl = async (url: string, listType: 'allow' | 'deny') => {
    if (listType === 'allow') {
      await firewallStore.removeFromAllowList(url);
    } else {
      await firewallStore.removeFromDenyList(url);
    }
    await loadFirewallSettings();
  };

  const cardClass =
    'rounded-[20px] bg-white p-6 text-left shadow-[inset_0_1px_1px_#fff,inset_-1px_-1px_1px_#fff,0_0_0_transparent] hover:shadow-[inset_0_1px_1px_#fff,inset_-1px_-1px_1px_#fff,0_4px_12px_rgba(0,0,0,0.08)] transition-shadow duration-500 ease-out';

  return (
    <section className="space-y-6">
      <div className={cardClass}>
        <h2 className="mb-4 text-lg font-medium text-black">{'Firewall'}</h2>

        <div className="space-y-6">
          <div className="my-6 rounded-xl bg-[#f4f4f4] p-4">
            <div className="flex items-center justify-between">
              <label htmlFor="toggle-firewall" className="text-[14px] font-medium text-black">
                {'Enable Firewall'}
              </label>
              <div className="relative inline-block w-12 select-none">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={handleToggleFirewall}
                  className="sr-only"
                  id="toggle-firewall"
                />
                <label
                  htmlFor="toggle-firewall"
                  className={`block h-6 cursor-pointer overflow-hidden rounded-full ${
                    isEnabled ? 'bg-accent' : isDarkMode ? 'bg-gray-600' : 'bg-gray-300'
                  }`}>
                  <span className="sr-only">{'Toggle Firewall'}</span>
                  <span
                    className={`block size-6 rounded-full bg-white shadow transition-transform ${
                      isEnabled ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="mb-6 mt-10 flex items-center justify-between">
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => setActiveList('allow')}
                className={`rounded-lg px-4 py-2 text-[14px] font-medium transition-colors ${
                  activeList === 'allow' ? 'bg-black text-white' : 'bg-neutral-200 text-black/70 hover:bg-neutral-300'
                }`}>
                {'Allow List'}
              </button>
              <button
                type="button"
                onClick={() => setActiveList('deny')}
                className={`rounded-lg px-4 py-2 text-[14px] font-medium transition-colors ${
                  activeList === 'deny' ? 'bg-black text-white' : 'bg-neutral-200 text-black/70 hover:bg-neutral-300'
                }`}>
                {'Deny List'}
              </button>
            </div>
          </div>

          <div className="mb-4 flex space-x-2">
            <input
              id="url-input"
              type="text"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleAddUrl();
                }
              }}
              placeholder={'Enter domain or URL (e.g. example.com, localhost, 127.0.0.1)'}
              className="flex-1 rounded-lg border-0 bg-[#f4f4f4] px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-black/20"
            />
            <button
              type="button"
              onClick={handleAddUrl}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black/90">
              {'Add'}
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {activeList === 'allow' ? (
              allowList.length > 0 ? (
                <ul className="space-y-2">
                  {allowList.map(url => (
                    <li key={url} className="flex items-center justify-between rounded-xl bg-[#f4f4f4] px-3 py-2.5">
                      <span className="text-sm text-black/70">{url}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveUrl(url, 'allow')}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50">
                        {'Remove'}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-center text-sm text-black/40">
                  {'No domains in allow list. Empty allow list means all non-denied domains are allowed.'}
                </p>
              )
            ) : denyList.length > 0 ? (
              <ul className="space-y-2">
                {denyList.map(url => (
                  <li key={url} className="flex items-center justify-between rounded-xl bg-[#f4f4f4] px-3 py-2.5">
                    <span className="text-sm text-black/70">{url}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveUrl(url, 'deny')}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50">
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-center text-sm text-black/40">{'No domains in deny list'}</p>
            )}
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <h2 className="mb-4 text-lg font-medium text-black">{'How the Firewall Works'}</h2>
        <ul className="list-disc space-y-2 pl-5 text-left text-sm text-black/60">
          {"The firewall contains a deny list and an allow list.\nIf both lists are empty, all URLs are allowed\nDeny list takes priority - if a URL matches any deny list entry, it's blocked\nWhen allow list is empty, all non-denied URLs are allowed\nWhen allow list is not empty, only matching URLs are allowed\nWildcards are NOT supported yet\nAllow list is preferred over deny list"
            .split('\n')
            .map((rule, index) => (
              <li key={index}>{rule}</li>
            ))}
        </ul>
      </div>
    </section>
  );
};
