import { describe, it, expect, vi } from 'vitest';
import { ServerClient } from '../serverClient';
import { ServerApiClient } from '../apiClient';
import type {
  ServerConversation,
  ServerMessage,
  SSEEvent,
  ExtensionQueryResponse,
  HotelContextManifest,
} from '../types';

function createMockApiClient() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    stream: vi.fn(),
  } as unknown as ServerApiClient;
}

function createServerClient(apiClient: ServerApiClient): ServerClient {
  const mockSettings = {};
  return Reflect.construct(ServerClient as unknown as new (...args: unknown[]) => ServerClient, [
    apiClient,
    mockSettings,
  ]);
}

const stubConversations: ServerConversation[] = [
  {
    id: 'conv-1',
    title: 'First conversation',
    firstMessagePreview: 'Hello there',
    lastMessageAt: '2026-01-15T10:00:00.000Z',
    messageCount: 3,
    createdAt: '2026-01-15T09:00:00.000Z',
  },
  {
    id: 'conv-2',
    title: 'Second conversation',
    firstMessagePreview: 'How are you?',
    lastMessageAt: '2026-01-16T12:00:00.000Z',
    messageCount: 5,
    createdAt: '2026-01-16T11:00:00.000Z',
  },
];

const stubMessages: ServerMessage[] = [
  { id: 'msg-1', role: 'user', content: 'Hello', createdAt: '2026-01-15T09:00:00.000Z' },
  {
    id: 'msg-2',
    role: 'assistant',
    content: 'Hi!',
    parts: [{ type: 'text', text: 'Hi!' }],
    createdAt: '2026-01-15T09:00:01.000Z',
  },
];

describe('ServerClient conversations', () => {
  describe('getConversations', () => {
    it('fetches with default params', async () => {
      const apiClient = createMockApiClient();
      vi.mocked(apiClient.get).mockResolvedValue({ data: stubConversations, status: 200, headers: new Headers() });
      const client = createServerClient(apiClient);

      const result = await client.getConversations();

      expect(apiClient.get).toHaveBeenCalledWith('/ai/conversations', {
        params: { limit: '50', offset: '0' },
      });
      expect(result).toEqual(stubConversations);
    });

    it('fetches with custom params', async () => {
      const apiClient = createMockApiClient();
      vi.mocked(apiClient.get).mockResolvedValue({ data: stubConversations, status: 200, headers: new Headers() });
      const client = createServerClient(apiClient);

      await client.getConversations(10, 20);

      expect(apiClient.get).toHaveBeenCalledWith('/ai/conversations', {
        params: { limit: '10', offset: '20' },
      });
    });

    it('returns the data array directly', async () => {
      const apiClient = createMockApiClient();
      vi.mocked(apiClient.get).mockResolvedValue({ data: [], status: 200, headers: new Headers() });
      const client = createServerClient(apiClient);

      const result = await client.getConversations();

      expect(result).toEqual([]);
    });
  });

  describe('getConversationMessages', () => {
    it('fetches messages for a conversation', async () => {
      const apiClient = createMockApiClient();
      vi.mocked(apiClient.get).mockResolvedValue({ data: stubMessages, status: 200, headers: new Headers() });
      const client = createServerClient(apiClient);

      const result = await client.getConversationMessages('conv-123');

      expect(apiClient.get).toHaveBeenCalledWith('/ai/conversations/conv-123/messages');
      expect(result).toEqual(stubMessages);
    });

    it('returns empty array when no messages', async () => {
      const apiClient = createMockApiClient();
      vi.mocked(apiClient.get).mockResolvedValue({ data: [], status: 200, headers: new Headers() });
      const client = createServerClient(apiClient);

      const result = await client.getConversationMessages('conv-empty');

      expect(result).toEqual([]);
    });
  });

  describe('deleteConversation', () => {
    it('calls delete on the correct path', async () => {
      const apiClient = createMockApiClient();
      vi.mocked(apiClient.delete).mockResolvedValue({ data: null, status: 204, headers: new Headers() });
      const client = createServerClient(apiClient);

      await client.deleteConversation('conv-456');

      expect(apiClient.delete).toHaveBeenCalledWith('/ai/conversations/conv-456');
    });

    it('returns void', async () => {
      const apiClient = createMockApiClient();
      vi.mocked(apiClient.delete).mockResolvedValue({ data: null, status: 204, headers: new Headers() });
      const client = createServerClient(apiClient);

      const result = await client.deleteConversation('conv-456');

      expect(result).toBeUndefined();
    });
  });

  describe('syncConversation', () => {
    const syncPayload = {
      conversationId: 'session-abc',
      title: 'Browser automation task',
      source: 'browser_automation',
      messages: [
        { role: 'user', content: 'Go to example.com', timestamp: 1700000000000 },
        { role: 'navigator', content: 'Navigating to example.com', timestamp: 1700000001000 },
      ],
    };

    it('posts to the sync endpoint', async () => {
      const apiClient = createMockApiClient();
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { created: true, messageCount: 2 },
        status: 200,
        headers: new Headers(),
      });
      const client = createServerClient(apiClient);

      const result = await client.syncConversation(syncPayload);

      expect(apiClient.post).toHaveBeenCalledWith('/ai/conversations/sync', syncPayload);
      expect(result).toEqual({ created: true, messageCount: 2 });
    });

    it('returns created: false when already synced', async () => {
      const apiClient = createMockApiClient();
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { created: false, messageCount: 2 },
        status: 200,
        headers: new Headers(),
      });
      const client = createServerClient(apiClient);

      const result = await client.syncConversation(syncPayload);

      expect(result.created).toBe(false);
    });
  });
});

describe('queryData', () => {
  it('posts to /ai/extension/query with query payload', async () => {
    const apiClient = createMockApiClient();
    const stubResponse: ExtensionQueryResponse = { text: 'answer', sources: ['s1'], latency: 42, escalation: null };
    vi.mocked(apiClient.post).mockResolvedValue({ data: stubResponse, status: 200, headers: new Headers() });
    const client = createServerClient(apiClient);

    await client.queryData('what is the ADR?');

    expect(apiClient.post).toHaveBeenCalledWith('/ai/extension/query', { query: 'what is the ADR?' });
  });

  it('returns ExtensionQueryResponse data', async () => {
    const apiClient = createMockApiClient();
    const stubResponse: ExtensionQueryResponse = { text: 'result', sources: [], latency: 10, escalation: null };
    vi.mocked(apiClient.post).mockResolvedValue({ data: stubResponse, status: 200, headers: new Headers() });
    const client = createServerClient(apiClient);

    const result = await client.queryData('test');

    expect(result).toEqual(stubResponse);
  });
});

describe('fetchHotelContext', () => {
  it('gets from /ai/extension/context', async () => {
    const apiClient = createMockApiClient();
    const stubManifest: HotelContextManifest = {
      hotel: {
        name: 'Test Hotel',
        timezone: 'UTC',
        currentDate: '2026-01-01',
        currency: { code: 'USD' },
        roomTypes: ['Standard'],
      },
      capabilities: [{ name: 'rates', description: 'Rate query', examples: ['ADR'] }],
      flags: { hasCompetitorData: false, hasMarketingIntegration: false, isMarketingOnly: false },
    };
    vi.mocked(apiClient.get).mockResolvedValue({ data: stubManifest, status: 200, headers: new Headers() });
    const client = createServerClient(apiClient);

    await client.fetchHotelContext();

    expect(apiClient.get).toHaveBeenCalledWith('/ai/extension/context');
  });

  it('returns HotelContextManifest on success', async () => {
    const apiClient = createMockApiClient();
    const stubManifest: HotelContextManifest = {
      hotel: { name: 'Test', timezone: 'UTC', currentDate: '2026-01-01', currency: { code: 'EUR' }, roomTypes: [] },
      capabilities: [],
      flags: { hasCompetitorData: true, hasMarketingIntegration: false, isMarketingOnly: false },
    };
    vi.mocked(apiClient.get).mockResolvedValue({ data: stubManifest, status: 200, headers: new Headers() });
    const client = createServerClient(apiClient);

    const result = await client.fetchHotelContext();

    expect(result).toEqual(stubManifest);
  });

  it('returns null on error (swallows exception)', async () => {
    const apiClient = createMockApiClient();
    vi.mocked(apiClient.get).mockRejectedValue(new Error('network error'));
    const client = createServerClient(apiClient);

    const result = await client.fetchHotelContext();

    expect(result).toBeNull();
  });
});

describe('streamChat', () => {
  async function* fakeStream(...events: SSEEvent[]): AsyncGenerator<SSEEvent> {
    for (const e of events) yield e;
  }

  it('yields from apiClient.stream with correct path and body', async () => {
    const apiClient = createMockApiClient();
    const stubEvent: SSEEvent = { event: 'message', data: '{"text":"hi"}' };
    vi.mocked(apiClient.stream).mockReturnValue(fakeStream(stubEvent));
    const client = createServerClient(apiClient);

    const messages = [{ role: 'user', content: 'hello' }];
    const collected: SSEEvent[] = [];
    for await (const event of client.streamChat(messages)) {
      collected.push(event);
    }

    expect(collected).toEqual([stubEvent]);
    expect(apiClient.stream).toHaveBeenCalledWith(
      '/ai/extension/chat',
      { messages, conversationId: undefined },
      expect.objectContaining({ timeout: 120_000 }),
    );
  });

  it('passes signal and 120s timeout to apiClient.stream', async () => {
    const apiClient = createMockApiClient();
    vi.mocked(apiClient.stream).mockReturnValue(fakeStream());
    const client = createServerClient(apiClient);

    const controller = new AbortController();
    const messages = [{ role: 'user', content: 'test' }];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of client.streamChat(messages, undefined, controller.signal)) {
      /* drain */
    }

    expect(apiClient.stream).toHaveBeenCalledWith(
      '/ai/extension/chat',
      { messages, conversationId: undefined },
      { signal: controller.signal, timeout: 120_000 },
    );
  });

  it('forwards conversationId in body when provided', async () => {
    const apiClient = createMockApiClient();
    vi.mocked(apiClient.stream).mockReturnValue(fakeStream());
    const client = createServerClient(apiClient);

    const messages = [{ role: 'user', content: 'hi' }];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of client.streamChat(messages, 'conv-999')) {
      /* drain */
    }

    expect(apiClient.stream).toHaveBeenCalledWith(
      '/ai/extension/chat',
      { messages, conversationId: 'conv-999' },
      expect.objectContaining({ timeout: 120_000 }),
    );
  });

  it('omits conversationId from body when undefined', async () => {
    const apiClient = createMockApiClient();
    vi.mocked(apiClient.stream).mockReturnValue(fakeStream());
    const client = createServerClient(apiClient);

    const messages = [{ role: 'user', content: 'test' }];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of client.streamChat(messages)) {
      /* drain */
    }

    const callArgs = vi.mocked(apiClient.stream).mock.calls[0];
    expect(callArgs[1]).toEqual({ messages, conversationId: undefined });
  });
});

describe('pullKeys', () => {
  const stubProviderKeys = {
    openai: { apiKey: 'sk-test-123', modelNames: ['gpt-4'] },
    anthropic: { apiKey: 'ant-key-456', modelNames: ['claude-3'] },
  };

  it('calls GET /ai/extension/keys', async () => {
    const apiClient = createMockApiClient();
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { keys: stubProviderKeys },
      status: 200,
      headers: new Headers(),
    });
    const client = createServerClient(apiClient);

    await client.pullKeys();

    expect(apiClient.get).toHaveBeenCalledWith('/ai/extension/keys');
  });

  it('returns provider configs from response', async () => {
    const apiClient = createMockApiClient();
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { keys: stubProviderKeys },
      status: 200,
      headers: new Headers(),
    });
    const client = createServerClient(apiClient);

    const result = await client.pullKeys();

    expect(result).toEqual(stubProviderKeys);
  });

  it('returns null when server returns null keys', async () => {
    const apiClient = createMockApiClient();
    vi.mocked(apiClient.get).mockResolvedValue({ data: { keys: null }, status: 200, headers: new Headers() });
    const client = createServerClient(apiClient);

    const result = await client.pullKeys();

    expect(result).toBeNull();
  });

  it('propagates API errors', async () => {
    const apiClient = createMockApiClient();
    vi.mocked(apiClient.get).mockRejectedValue(new Error('unauthorized'));
    const client = createServerClient(apiClient);

    await expect(client.pullKeys()).rejects.toThrow('unauthorized');
  });
});
