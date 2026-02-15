import type { ServerSettingsStorage } from '@extension/storage';
import { ServerApiClient } from './apiClient';

interface LoginResponse {
  id: string;
  email: string;
  accessToken: string;
  loginState: string;
}

function decodeJwtExp(token: string): number {
  const payload = JSON.parse(atob(token.split('.')[1]));
  return payload.exp * 1000;
}

export class ServerClient {
  private constructor(
    readonly apiClient: ServerApiClient,
    private readonly settings: ServerSettingsStorage,
  ) {}

  static async create(serverSettings: ServerSettingsStorage): Promise<ServerClient | null> {
    const config = await serverSettings.getSettings();
    if (!config.serverUrl) return null;

    const apiClient = new ServerApiClient({ baseUrl: config.serverUrl }, async () => {
      const settings = await serverSettings.getSettings();
      if (!settings.accessToken || settings.tokenExpiresAt <= Date.now()) return null;
      return settings.accessToken;
    });

    return new ServerClient(apiClient, serverSettings);
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    const { data } = await this.apiClient.post<LoginResponse>('/auth/login', { email, password }, { skipAuth: true });
    const expiresAt = decodeJwtExp(data.accessToken);
    await this.settings.setAuth(data.accessToken, data.id, expiresAt);
    return data;
  }

  async logout(): Promise<void> {
    await this.settings.clearAuth();
  }

  async isAuthenticated(): Promise<boolean> {
    return this.settings.hasValidToken();
  }

  async checkHealth(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = performance.now();
    const healthy = await this.apiClient.isHealthy();
    const latencyMs = performance.now() - start;
    return { healthy, latencyMs };
  }
}
