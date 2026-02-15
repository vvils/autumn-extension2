import { describe, it, expect, vi } from 'vitest';
import { ServerApiClient } from '../apiClient';
import type { SSEEvent } from '../types';
import { ServerApiError, ServerNetworkError } from '../errors';

function createMockFetch(responses: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>) {
  let callCount = 0;
  const fn = vi.fn(async () => {
    const res = responses[Math.min(callCount++, responses.length - 1)];
    const headersObj = new Headers({ 'Content-Type': 'application/json', ...res.headers });
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      headers: headersObj,
      url: 'http://test.local/test',
      json: async () => res.body,
      text: async () => (typeof res.body === 'string' ? res.body : JSON.stringify(res.body ?? '')),
    } as unknown as Response;
  });
  return fn;
}

function createClient(
  fetchImpl: typeof fetch,
  overrides?: { maxRetries?: number; retryBaseDelay?: number },
): ServerApiClient {
  return new ServerApiClient(
    {
      baseUrl: 'http://test.local',
      maxRetries: overrides?.maxRetries ?? 3,
      retryBaseDelay: overrides?.retryBaseDelay ?? 1,
      retryMaxDelay: 50,
      fetchImpl,
    },
    async () => null,
  );
}

function sseResponse(body: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });

  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    body: stream,
    url: 'http://test.local/stream',
    text: async () => body,
  } as unknown as Response;
}

function sseResponseChunked(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });

  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    body: stream,
    url: 'http://test.local/stream',
    text: async () => chunks.join(''),
  } as unknown as Response;
}

async function collectEvents(client: ServerApiClient, path: string, body?: unknown) {
  const events: SSEEvent[] = [];
  for await (const event of client.stream(path, body, { skipAuth: true })) {
    events.push(event);
  }
  return events;
}

// -- SSE parser tests --

describe('ServerApiClient SSE parser', () => {
  it('parses a basic single event', async () => {
    const fetchImpl = vi.fn(async () => sseResponse('data: hello\n\n'));
    const client = createClient(fetchImpl as unknown as typeof fetch);

    const events = await collectEvents(client, '/stream');

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ event: 'message', data: 'hello', id: undefined, retry: undefined });
  });

  it('joins multi-line data with newlines', async () => {
    const fetchImpl = vi.fn(async () => sseResponse('data: line1\ndata: line2\ndata: line3\n\n'));
    const client = createClient(fetchImpl as unknown as typeof fetch);

    const events = await collectEvents(client, '/stream');

    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('line1\nline2\nline3');
  });

  it('parses custom event types', async () => {
    const fetchImpl = vi.fn(async () => sseResponse('event: status\ndata: ok\n\n'));
    const client = createClient(fetchImpl as unknown as typeof fetch);

    const events = await collectEvents(client, '/stream');

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('status');
    expect(events[0].data).toBe('ok');
  });

  it('skips comment lines', async () => {
    const fetchImpl = vi.fn(async () => sseResponse(': this is a comment\ndata: real\n\n'));
    const client = createClient(fetchImpl as unknown as typeof fetch);

    const events = await collectEvents(client, '/stream');

    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('real');
  });

  it('parses id and retry fields', async () => {
    const fetchImpl = vi.fn(async () => sseResponse('id: 42\nretry: 3000\ndata: payload\n\n'));
    const client = createClient(fetchImpl as unknown as typeof fetch);

    const events = await collectEvents(client, '/stream');

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('42');
    expect(events[0].retry).toBe(3000);
  });

  it('handles chunk boundary splitting a line in the middle', async () => {
    const fetchImpl = vi.fn(async () => sseResponseChunked(['data: hel', 'lo\n\n']));
    const client = createClient(fetchImpl as unknown as typeof fetch);

    const events = await collectEvents(client, '/stream');

    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('hello');
  });

  it('parses multiple events in sequence', async () => {
    const fetchImpl = vi.fn(async () => sseResponse('data: first\n\ndata: second\n\n'));
    const client = createClient(fetchImpl as unknown as typeof fetch);

    const events = await collectEvents(client, '/stream');

    expect(events).toHaveLength(2);
    expect(events[0].data).toBe('first');
    expect(events[1].data).toBe('second');
  });

  it('resets event type to "message" after each event', async () => {
    const fetchImpl = vi.fn(async () => sseResponse('event: custom\ndata: a\n\ndata: b\n\n'));
    const client = createClient(fetchImpl as unknown as typeof fetch);

    const events = await collectEvents(client, '/stream');

    expect(events[0].event).toBe('custom');
    expect(events[1].event).toBe('message');
  });
});

// -- Retry logic tests --

describe('ServerApiClient retry logic', () => {
  it('makes a single fetch call on success', async () => {
    const fetchImpl = createMockFetch([{ status: 200, body: { ok: true } }]);
    const client = createClient(fetchImpl as unknown as typeof fetch);

    const result = await client.get<{ ok: boolean }>('/test', { skipAuth: true });

    expect(result.data).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries on 500 up to maxRetries then throws ServerApiError', async () => {
    const fetchImpl = createMockFetch([
      { status: 500, body: 'Internal Server Error' },
      { status: 500, body: 'Internal Server Error' },
      { status: 500, body: 'Internal Server Error' },
    ]);
    const client = createClient(fetchImpl as unknown as typeof fetch, { maxRetries: 3, retryBaseDelay: 1 });

    await expect(client.get('/test', { skipAuth: true })).rejects.toThrow(ServerApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does not retry on 400', async () => {
    const fetchImpl = createMockFetch([{ status: 400, body: 'Bad Request' }]);
    const client = createClient(fetchImpl as unknown as typeof fetch, { maxRetries: 3 });

    await expect(client.get('/test', { skipAuth: true })).rejects.toThrow(ServerApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 401', async () => {
    const fetchImpl = createMockFetch([{ status: 401, body: 'Unauthorized' }]);
    const client = createClient(fetchImpl as unknown as typeof fetch, { maxRetries: 3 });

    await expect(client.get('/test', { skipAuth: true })).rejects.toThrow(ServerApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('skips retries when skipRetry is true', async () => {
    const fetchImpl = createMockFetch([{ status: 500, body: 'Server Error' }]);
    const client = createClient(fetchImpl as unknown as typeof fetch, { maxRetries: 3 });

    await expect(client.get('/test', { skipAuth: true, skipRetry: true })).rejects.toThrow(ServerApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('wraps TypeError in ServerNetworkError and retries', async () => {
    const callCount = { value: 0 };
    const fetchImpl = vi.fn(async () => {
      callCount.value++;
      if (callCount.value <= 2) {
        throw new TypeError('Failed to fetch');
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        url: 'http://test.local/test',
        json: async () => ({ ok: true }),
        text: async () => '{"ok":true}',
      } as unknown as Response;
    });
    const client = createClient(fetchImpl as unknown as typeof fetch, { maxRetries: 3, retryBaseDelay: 1 });

    const result = await client.get<{ ok: boolean }>('/test', { skipAuth: true });

    expect(result.data).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('throws ServerNetworkError when all retries fail with network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const client = createClient(fetchImpl as unknown as typeof fetch, { maxRetries: 2, retryBaseDelay: 1 });

    await expect(client.get('/test', { skipAuth: true })).rejects.toThrow(ServerNetworkError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries on 500 then succeeds', async () => {
    const fetchImpl = createMockFetch([
      { status: 500, body: 'Error' },
      { status: 200, body: { recovered: true } },
    ]);
    const client = createClient(fetchImpl as unknown as typeof fetch, { maxRetries: 3, retryBaseDelay: 1 });

    const result = await client.get<{ recovered: boolean }>('/test', { skipAuth: true });

    expect(result.data).toEqual({ recovered: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
