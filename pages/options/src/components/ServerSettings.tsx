import { useState, useEffect, useRef } from 'react';
import { type ServerSettingsConfig, serverSettingsStore, DEFAULT_SERVER_SETTINGS } from '@extension/storage';
import { t } from '@extension/i18n';

interface ServerSettingsProps {
  isDarkMode?: boolean;
}

type ConnectionStatus = 'idle' | 'testing' | 'connected' | 'failed';

function decodeJwtExp(token: string): number {
  const payload = JSON.parse(atob(token.split('.')[1]));
  return payload.exp * 1000;
}

export const ServerSettings = ({ isDarkMode = false }: ServerSettingsProps) => {
  const [settings, setSettings] = useState<ServerSettingsConfig>(DEFAULT_SERVER_SETTINGS);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    serverSettingsStore.getSettings().then(setSettings);
  }, []);

  const isAuthenticated = Boolean(settings.accessToken) && settings.tokenExpiresAt > Date.now();
  const hasServerUrl = Boolean(settings.serverUrl);

  const saveServerUrl = async (url: string) => {
    const trimmed = url.replace(/\/+$/, '');
    setSettings(prev => ({ ...prev, serverUrl: trimmed }));
    await serverSettingsStore.updateSettings({ serverUrl: trimmed });
    setConnectionStatus('idle');
  };

  const testConnection = async () => {
    if (!settings.serverUrl) return;
    setConnectionStatus('testing');
    try {
      const start = performance.now();
      const response = await fetch(`${settings.serverUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      const elapsed = Math.round(performance.now() - start);
      if (response.ok) {
        setConnectionStatus('connected');
        setLatencyMs(elapsed);
      } else {
        setConnectionStatus('failed');
      }
    } catch {
      setConnectionStatus('failed');
    }
  };

  const handleLogin = async () => {
    if (!loginEmail || !loginPassword) return;
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const response = await fetch(`${settings.serverUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        let message = `Login failed (${response.status})`;
        try {
          const parsed = JSON.parse(body) as { message?: string };
          if (parsed.message) message = parsed.message;
        } catch {
          // use default message
        }
        setLoginError(message);
        return;
      }
      const data = (await response.json()) as { id: string; accessToken: string };
      const expiresAt = decodeJwtExp(data.accessToken);
      await serverSettingsStore.setAuth(data.accessToken, data.id, expiresAt);
      setSettings(await serverSettingsStore.getSettings());
      setLoginEmail('');
      setLoginPassword('');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await serverSettingsStore.clearAuth();
    setSettings(await serverSettingsStore.getSettings());
  };

  const cardClass = `rounded-lg border ${isDarkMode ? 'border-slate-700 bg-slate-800' : 'border-blue-100 bg-white'} p-6 text-left shadow-sm`;
  const headingClass = `mb-4 text-left text-xl font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`;
  const labelClass = `text-base font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`;
  const inputClass = `w-full rounded-md border ${isDarkMode ? 'border-slate-600 bg-slate-700 text-gray-200' : 'border-gray-300 bg-white text-gray-700'} px-3 py-2`;
  const btnPrimary = `rounded-md px-4 py-2 text-sm font-medium text-white ${isDarkMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'} disabled:opacity-50`;
  const btnDanger = `rounded-md px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700`;

  return (
    <section className="space-y-6">
      {/* Server URL */}
      <div className={cardClass}>
        <h2 className={headingClass}>{t('options_server_url_label')}</h2>

        <div className="space-y-4">
          <div>
            <label htmlFor="serverUrl" className="sr-only">
              {t('options_server_url_label')}
            </label>
            <input
              ref={urlInputRef}
              id="serverUrl"
              type="url"
              placeholder={t('options_server_url_placeholder')}
              value={settings.serverUrl}
              onChange={e => setSettings(prev => ({ ...prev, serverUrl: e.target.value }))}
              onBlur={e => saveServerUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveServerUrl((e.target as HTMLInputElement).value);
              }}
              className={inputClass}
            />
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={testConnection}
              disabled={!hasServerUrl || connectionStatus === 'testing'}
              className={btnPrimary}>
              {connectionStatus === 'testing' ? '...' : t('options_server_testConnection')}
            </button>

            <span
              className={`text-sm font-medium ${
                connectionStatus === 'connected'
                  ? 'text-green-500'
                  : connectionStatus === 'failed'
                    ? 'text-red-500'
                    : isDarkMode
                      ? 'text-gray-400'
                      : 'text-gray-500'
              }`}>
              {connectionStatus === 'idle' && !hasServerUrl && t('options_server_status_notConfigured')}
              {connectionStatus === 'idle' && hasServerUrl && ''}
              {connectionStatus === 'testing' && '...'}
              {connectionStatus === 'connected' && t('options_server_status_connected', [String(latencyMs)])}
              {connectionStatus === 'failed' && t('options_server_status_failed')}
            </span>
          </div>
        </div>
      </div>

      {/* Authentication */}
      {hasServerUrl && (
        <div className={cardClass}>
          <h2 className={headingClass}>{t('options_server_auth_title')}</h2>

          {isAuthenticated ? (
            <div className="flex items-center justify-between">
              <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                {t('options_server_auth_loggedIn', [settings.userId])}
              </p>
              <button type="button" onClick={handleLogout} className={btnDanger}>
                {t('options_server_auth_logout')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label htmlFor="loginEmail" className={labelClass}>
                  {t('options_server_auth_email')}
                </label>
                <input
                  id="loginEmail"
                  type="email"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                />
              </div>

              <div>
                <label htmlFor="loginPassword" className={labelClass}>
                  {t('options_server_auth_password')}
                </label>
                <input
                  id="loginPassword"
                  type="password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleLogin();
                  }}
                  className={`mt-1 ${inputClass}`}
                />
              </div>

              {loginError && <p className="text-sm text-red-500">{loginError}</p>}

              <button
                type="button"
                onClick={handleLogin}
                disabled={isLoggingIn || !loginEmail || !loginPassword}
                className={btnPrimary}>
                {isLoggingIn ? '...' : t('options_server_auth_login')}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
