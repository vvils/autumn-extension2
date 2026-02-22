import type { ServerApiClientConfig, RequestOptions, ApiResponse, SSEEvent } from './types';
import {
  ServerApiError,
  ServerNetworkError,
  ServerTimeoutError,
  createServerErrorFromResponse,
  isRetryableServerError,
} from './errors';
import { createLogger } from '../../log';

type ResolvedConfig = Required<ServerApiClientConfig>;

export class ServerApiClient {
  private readonly config: ResolvedConfig;
  private readonly fetch: typeof globalThis.fetch;
  private readonly log = createLogger('ServerApiClient');

  constructor(
    config: ServerApiClientConfig,
    private readonly getAuthToken: () => Promise<string | null>,
    private readonly onAuthFailure?: () => void,
  ) {
    this.config = {
      defaultTimeout: 30_000,
      maxRetries: 3,
      retryBaseDelay: 1_000,
      retryMaxDelay: 30_000,
      fetchImpl: globalThis.fetch,
      ...config,
    };
    this.fetch = this.config.fetchImpl.bind(globalThis);
  }

  async get<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body, options);
  }

  async patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', path, body, options);
  }

  async delete<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.get('/health', { timeout: 5_000, skipAuth: true, skipRetry: true });
      return true;
    } catch {
      return false;
    }
  }

  async *stream(path: string, body?: unknown, options?: RequestOptions): AsyncGenerator<SSEEvent> {
    const url = this.buildUrl(path, options?.params);
    const method = body !== undefined ? 'POST' : 'GET';
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      ...options?.headers,
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (!options?.skipAuth) {
      await this.injectAuthHeader(headers);
    }

    const timeout = options?.timeout ?? this.config.defaultTimeout;
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeout);

    const signals: AbortSignal[] = [timeoutController.signal];
    if (options?.signal) {
      signals.push(options.signal);
    }
    const combinedSignal = AbortSignal.any(signals);

    try {
      const response = await this.fetch(url.toString(), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: combinedSignal,
      });

      if (!response.ok) {
        if (response.status === 401) this.onAuthFailure?.();
        const responseBody = await response.text().catch(() => undefined);
        throw createServerErrorFromResponse(response.status, method, url.toString(), responseBody);
      }

      yield* this.parseSSEStream(response.body!, combinedSignal);
    } catch (raw) {
      throw this.normalizeError(raw, timeoutController, method, url.toString());
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    const maxAttempts = options?.skipRetry ? 1 : (options?.retries ?? this.config.maxRetries);
    const url = this.buildUrl(path, options?.params);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const timeoutController = new AbortController();
      const timeout = options?.timeout ?? this.config.defaultTimeout;
      const timeoutId = setTimeout(() => timeoutController.abort(), timeout);

      const signals: AbortSignal[] = [timeoutController.signal];
      if (options?.signal) {
        signals.push(options.signal);
      }
      const combinedSignal = AbortSignal.any(signals);

      try {
        const headers: Record<string, string> = { ...options?.headers };
        if (body !== undefined) {
          headers['Content-Type'] = 'application/json';
        }

        if (!options?.skipAuth) {
          await this.injectAuthHeader(headers);
        }

        const response = await this.fetch(url.toString(), {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: combinedSignal,
        });

        if (!response.ok) {
          if (response.status === 401) this.onAuthFailure?.();
          const responseBody = await response.text().catch(() => undefined);
          throw createServerErrorFromResponse(response.status, method, url.toString(), responseBody);
        }

        const data = await this.parseJsonResponse<T>(response);
        return { data, status: response.status, headers: response.headers };
      } catch (raw) {
        const error = this.normalizeError(raw, timeoutController, method, url.toString());

        const isLastAttempt = attempt >= maxAttempts - 1;
        if (isLastAttempt || options?.skipRetry || !this.shouldRetry(error)) {
          throw error;
        }

        const delay = this.calculateBackoff(attempt, error);
        this.log.info(`Retrying ${method} ${path} (attempt ${attempt + 1}/${maxAttempts}) after ${delay}ms`);
        await this.sleep(delay, options?.signal);
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw new ServerNetworkError(`Exhausted ${maxAttempts} attempts for ${method} ${path}`);
  }

  private buildUrl(path: string, params?: Record<string, string>): URL {
    const url = new URL(path, this.config.baseUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    return url;
  }

  private async injectAuthHeader(headers: Record<string, string>): Promise<void> {
    const token = await this.getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  private async parseJsonResponse<T>(response: Response): Promise<T> {
    if (response.status === 204) {
      return null as unknown as T;
    }

    const contentType = response.headers.get('Content-Type') ?? '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      throw new ServerApiError(
        `Expected JSON response but got ${contentType || 'no content type'}`,
        response.status,
        '',
        response.url,
        text,
      );
    }

    try {
      return (await response.json()) as T;
    } catch (cause) {
      throw new ServerApiError('Failed to parse JSON response', response.status, '', response.url);
    }
  }

  private normalizeError(error: unknown, timeoutController: AbortController, method: string, url: string): unknown {
    if (error instanceof ServerApiError || error instanceof ServerNetworkError || error instanceof ServerTimeoutError) {
      return error;
    }

    if (error instanceof TypeError) {
      return new ServerNetworkError(`Network request failed: ${method} ${url}`, error);
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      if (timeoutController.signal.aborted) {
        return new ServerTimeoutError(`Request timed out: ${method} ${url}`);
      }
      return error;
    }

    return error;
  }

  private shouldRetry(error: unknown): boolean {
    if (isRetryableServerError(error)) return true;
    return error instanceof ServerApiError && error.statusCode === 429;
  }

  private calculateBackoff(attempt: number, error: unknown): number {
    if (error instanceof ServerApiError && error.statusCode === 429) {
      const retryAfter = this.parseRetryAfterFromBody(error.responseBody);
      if (retryAfter !== null) return Math.min(retryAfter, this.config.retryMaxDelay);
    }

    const jitter = Math.random() * this.config.retryBaseDelay * 0.5;
    const exponential = this.config.retryBaseDelay * Math.pow(2, attempt);
    return Math.min(exponential + jitter, this.config.retryMaxDelay);
  }

  private parseRetryAfterFromBody(body?: string): number | null {
    if (!body) return null;
    try {
      const parsed = JSON.parse(body) as { retry_after?: number };
      if (typeof parsed.retry_after === 'number') {
        return parsed.retry_after * 1_000;
      }
    } catch {
      // Not JSON or no retry_after field
    }
    return null;
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }

      const timeoutId = setTimeout(resolve, ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timeoutId);
          reject(signal.reason);
        },
        { once: true },
      );
    });
  }

  private async *parseSSEStream(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<SSEEvent> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let event = 'message';
    let data: string[] = [];
    let id: string | undefined;
    let retry: number | undefined;

    try {
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          if (line === '') {
            if (data.length > 0) {
              yield { event, data: data.join('\n'), id, retry };
              event = 'message';
              data = [];
              id = undefined;
              retry = undefined;
            }
            continue;
          }

          if (line.startsWith(':')) continue;

          const colonIndex = line.indexOf(':');
          if (colonIndex === -1) continue;

          const field = line.slice(0, colonIndex);
          const fieldValue = line.slice(colonIndex + 1).replace(/^ /, '');

          switch (field) {
            case 'event':
              event = fieldValue;
              break;
            case 'data':
              data.push(fieldValue);
              break;
            case 'id':
              id = fieldValue;
              break;
            case 'retry': {
              const parsed = parseInt(fieldValue, 10);
              if (!isNaN(parsed)) retry = parsed;
              break;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
