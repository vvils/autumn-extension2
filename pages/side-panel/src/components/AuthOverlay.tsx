import { t } from '@extension/i18n';

const CLIENT_URL = import.meta.env.VITE_CLIENT_URL || 'http://localhost:3000';

export function AuthOverlay() {
  const handleSignIn = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.update(tab.id, { url: CLIENT_URL });
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white p-6 text-center">
      <img src="/logo.svg" alt="Autumn" className="mb-6 h-8" />
      <h2 className="mb-2 text-lg font-semibold text-gray-900">{t('auth_overlay_title')}</h2>
      <p className="mb-6 max-w-[260px] text-sm text-gray-500">{t('auth_overlay_subtitle')}</p>
      <button
        type="button"
        onClick={handleSignIn}
        className="bg-accent hover:bg-accent-hover rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-colors">
        {t('auth_overlay_signIn')}
      </button>
    </div>
  );
}
