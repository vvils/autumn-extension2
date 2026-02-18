const SERVER_SETTINGS_KEY = 'server-settings';
const WEB_APP_TOKEN_KEY = 'token';

function sendTokenToBackground(token: string | null) {
  chrome.runtime.sendMessage({ type: 'WEB_APP_AUTH_TOKEN', token }).catch(() => {
    // Background may not be ready yet — safe to ignore
  });
}

async function detectAuth() {
  const result = await chrome.storage.local.get(SERVER_SETTINGS_KEY);
  const settings = result[SERVER_SETTINGS_KEY];
  if (!settings?.serverUrl) return;

  try {
    if (window.location.origin !== new URL(settings.serverUrl).origin) return;
  } catch {
    return;
  }

  sendTokenToBackground(localStorage.getItem(WEB_APP_TOKEN_KEY));

  window.addEventListener('storage', e => {
    if (e.key === WEB_APP_TOKEN_KEY) sendTokenToBackground(e.newValue);
  });
}

detectAuth();
