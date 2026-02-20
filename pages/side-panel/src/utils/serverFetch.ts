import { serverSettingsStore } from '@extension/storage';

export async function serverFetch(path: string, options?: RequestInit): Promise<Response> {
  const { serverUrl, accessToken } = await serverSettingsStore.getSettings();
  const base = serverUrl.replace(/\/+$/, '');
  return fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...options?.headers,
    },
    signal: options?.signal ?? AbortSignal.timeout(10_000),
  });
}
