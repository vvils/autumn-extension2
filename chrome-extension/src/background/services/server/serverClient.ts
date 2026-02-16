import type { ServerSettingsStorage } from '@extension/storage';
import type { ServerConversation, ServerMessage, SyncConversationPayload } from './types';
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

  async getConversations(limit = 50, offset = 0): Promise<ServerConversation[]> {
    const { data } = await this.apiClient.get<ServerConversation[]>('/ai/conversations', {
      params: { limit: String(limit), offset: String(offset) },
    });
    return data;
  }

  async getConversationMessages(conversationId: string): Promise<ServerMessage[]> {
    const { data } = await this.apiClient.get<ServerMessage[]>(
      `/ai/conversations/${encodeURIComponent(conversationId)}/messages`,
    );
    return data;
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.apiClient.delete(`/ai/conversations/${encodeURIComponent(conversationId)}`);
  }

  async syncConversation(payload: SyncConversationPayload): Promise<{ created: boolean; messageCount: number }> {
    const { data } = await this.apiClient.post<{ created: boolean; messageCount: number }>(
      '/ai/conversations/sync',
      payload,
    );
    return data;
  }
}
