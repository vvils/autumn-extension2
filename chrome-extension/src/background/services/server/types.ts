export interface ServerApiClientConfig {
  baseUrl: string;
  defaultTimeout?: number;
  maxRetries?: number;
  retryBaseDelay?: number;
  retryMaxDelay?: number;
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  skipAuth?: boolean;
  skipRetry?: boolean;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

export interface SSEEvent {
  event: string;
  data: string;
  id?: string;
  retry?: number;
}
