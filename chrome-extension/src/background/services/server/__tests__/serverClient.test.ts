import { describe, it, expect, vi } from 'vitest';
import { ServerClient } from '../serverClient';
import { ServerApiClient } from '../apiClient';
import type { ServerConversation, ServerMessage } from '../types';

function createMockApiClient() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
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
