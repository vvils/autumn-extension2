import type { ServerSettingsStorage } from '@extension/storage';
import type {
  ServerConversation,
  ServerMessage,
  SyncConversationPayload,
  SSEEvent,
  HotelContextManifest,
  ExtensionQueryResponse,
  PullKeysResponse,
  CreateConversationPayload,
  AddMessagePayload,
} from './types';
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

  async createConversation(title: string, source: string, id?: string): Promise<ServerConversation> {
    const body: CreateConversationPayload = { title, source };
    if (id) body.id = id;
    const { data } = await this.apiClient.post<ServerConversation>('/ai/conversations', body);
    return data;
  }

  async addMessage(conversationId: string, message: AddMessagePayload): Promise<ServerMessage> {
    const { data } = await this.apiClient.post<ServerMessage>(
      `/ai/conversations/${encodeURIComponent(conversationId)}/messages`,
      message,
    );
    return data;
  }

  async syncConversation(payload: SyncConversationPayload): Promise<{ created: boolean; messageCount: number }> {
    const { data } = await this.apiClient.post<{ created: boolean; messageCount: number }>(
      '/ai/conversations/sync',
      payload,
    );
    return data;
  }

  async *streamChat(
    messages: Array<{ role: string; content: string }>,
    conversationId?: string,
    signal?: AbortSignal,
  ): AsyncGenerator<SSEEvent> {
    yield* this.apiClient.stream('/ai/extension/chat', { messages, conversationId }, { signal, timeout: 120_000 });
  }

  async queryData(query: string): Promise<ExtensionQueryResponse> {
    const { data } = await this.apiClient.post<ExtensionQueryResponse>('/ai/extension/query', { query });
    return data;
  }

  async fetchHotelContext(): Promise<HotelContextManifest | null> {
    try {
      const { data } = await this.apiClient.get<HotelContextManifest>('/ai/extension/context');
      return data;
    } catch {
      return null;
    }
  }

  async pullKeys(): Promise<PullKeysResponse> {
    const { data } = await this.apiClient.get<PullKeysResponse>('/ai/extension/keys');
    return { keys: data.keys, agentModels: data.agentModels };
  }
}
