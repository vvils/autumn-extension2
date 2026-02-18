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

async function readTokenFromTab(tabId: number): Promise<string | null> {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (key: string) => localStorage.getItem(key),
      args: [WEB_APP_TOKEN_KEY],
    });
    return result?.result ?? null;
  } catch {
    return null;
  }
}

export async function detectTokenFromTabs(settings: ServerSettingsStorage): Promise<boolean> {
  const config = await settings.getSettings();
  if (!config.serverUrl) return false;

  let serverOrigin: string;
  try {
    serverOrigin = new URL(config.serverUrl).origin;
  } catch {
    return false;
  }

  const tabs = await chrome.tabs.query({ url: `${serverOrigin}/*` });
  for (const tab of tabs) {
    if (!tab.id) continue;
    const token = await readTokenFromTab(tab.id);
    if (token) {
      try {
        const { userId, exp } = decodeJwtPayload(token);
        await settings.setAuth(token, userId, exp);
        logger.info('Auto-detected auth token from open tab');
        return true;
      } catch {
        logger.warning('Found token in tab but failed to decode');
      }
    }
  }
  return false;
}

export function listenForWebAppAuth(settings: ServerSettingsStorage, onAuthChanged: () => void): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'WEB_APP_AUTH_TOKEN') return;
    sendResponse({ received: true });

    (async () => {
      const token: string | null = message.token;
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
