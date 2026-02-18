import type { ServerSettingsStorage } from '@extension/storage';
import { createLogger } from '../../log';

const logger = createLogger('tokenDetector');

const WEB_APP_TOKEN_KEY = 'token';

interface JwtPayload {
  userId: string;
  exp: number;
}

function decodeJwtPayload(token: string): JwtPayload {
  const payload = JSON.parse(atob(token.split('.')[1]));
  return { userId: payload.userId, exp: payload.exp * 1000 };
}

async function getClientOrigin(settings: ServerSettingsStorage): Promise<string | null> {
  const config = await settings.getSettings();
  const clientUrl = config.clientUrl || config.serverUrl;
  if (!clientUrl) {
    logger.debug('getClientOrigin: no clientUrl or serverUrl configured');
    return null;
  }
  try {
    return new URL(clientUrl).origin;
  } catch {
    logger.warning('getClientOrigin: invalid URL', clientUrl);
    return null;
  }
}

async function readTokenFromTab(tabId: number): Promise<string | null> {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (key: string) => localStorage.getItem(key),
      args: [WEB_APP_TOKEN_KEY],
    });
    return result?.result ?? null;
  } catch (error) {
    logger.debug('readTokenFromTab: script execution failed for tab', tabId, error);
    return null;
  }
}

async function storeTokenIfValid(token: string, settings: ServerSettingsStorage): Promise<boolean> {
  const config = await settings.getSettings();
  if (token === config.accessToken) {
    logger.debug('storeTokenIfValid: token unchanged, skipping');
    return false;
  }
  const { userId, exp } = decodeJwtPayload(token);
  await settings.setAuth(token, userId, exp);
  logger.info('Auth token stored — userId:', userId, 'expires:', new Date(exp).toISOString());
  return true;
}

export async function detectTokenFromTabs(settings: ServerSettingsStorage): Promise<boolean> {
  const clientOrigin = await getClientOrigin(settings);
  if (!clientOrigin) return false;

  const tabs = await chrome.tabs.query({ url: `${clientOrigin}/*` });
  logger.debug('detectTokenFromTabs: found', tabs.length, 'tabs matching', clientOrigin);

  for (const tab of tabs) {
    if (!tab.id) continue;
    const token = await readTokenFromTab(tab.id);
    logger.debug('detectTokenFromTabs: tab', tab.id, tab.url, '→ token', token ? 'present' : 'absent');
    if (!token) continue;
    try {
      if (await storeTokenIfValid(token, settings)) return true;
    } catch (error) {
      logger.warning('detectTokenFromTabs: failed to decode token from tab', tab.id, error);
    }
  }
  return false;
}

export function watchTabsForAuth(settings: ServerSettingsStorage, onAuthChanged: () => void): void {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') return;

    (async () => {
      const clientOrigin = await getClientOrigin(settings);
      if (!clientOrigin) return;
      if (!tab.url?.startsWith(clientOrigin)) return;

      logger.debug('watchTabsForAuth: tab loaded on client origin', tabId, tab.url);
      const token = await readTokenFromTab(tabId);
      if (!token) {
        logger.debug('watchTabsForAuth: no token in tab', tabId);
        return;
      }
      try {
        if (await storeTokenIfValid(token, settings)) {
          onAuthChanged();
        }
      } catch (error) {
        logger.warning('watchTabsForAuth: failed to process token from tab', tabId, error);
      }
    })();
  });

  logger.info('watchTabsForAuth: listening for tab updates');
}

export function listenForWebAppAuth(settings: ServerSettingsStorage, onAuthChanged: () => void): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'WEB_APP_AUTH_TOKEN') return;
    sendResponse({ received: true });

    (async () => {
      const token: string | null = message.token;
      logger.debug('listenForWebAppAuth: received token', token ? 'present' : 'null');
      const config = await settings.getSettings();

      if (token) {
        if (token === config.accessToken) return;
        try {
          const { userId, exp } = decodeJwtPayload(token);
          await settings.setAuth(token, userId, exp);
          logger.info('Auth token updated from web app');
          onAuthChanged();
        } catch {
          logger.warning('Received invalid token from content script');
        }
      } else if (config.accessToken) {
        await settings.clearAuth();
        logger.info('Auth cleared — web app logged out');
        onAuthChanged();
      }
    })();
  });
}
