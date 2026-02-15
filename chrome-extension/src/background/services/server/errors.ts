export class ServerApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly method: string,
    public readonly url: string,
    public readonly responseBody?: string,
  ) {
    super(message);
    this.name = 'ServerApiError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ServerApiError);
    }
  }

  toString(): string {
    return `${this.name}: ${this.statusCode} ${this.method} ${this.url} - ${this.message}`;
  }
}

export class ServerNetworkError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ServerNetworkError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ServerNetworkError);
    }
  }

  toString(): string {
    return `${this.name}: ${this.message}${this.cause ? ` (Caused by: ${this.cause})` : ''}`;
  }
}

export class ServerTimeoutError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ServerTimeoutError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ServerTimeoutError);
    }
  }

  toString(): string {
    return `${this.name}: ${this.message}${this.cause ? ` (Caused by: ${this.cause})` : ''}`;
  }
}

export function isServerAuthError(error: unknown): error is ServerApiError {
  return error instanceof ServerApiError && error.statusCode === 401;
}

export function isServerNetworkError(error: unknown): error is ServerNetworkError {
  return error instanceof ServerNetworkError;
}

export function isServerTimeoutError(error: unknown): error is ServerTimeoutError {
  return error instanceof ServerTimeoutError;
}

export function isRetryableServerError(error: unknown): boolean {
  if (error instanceof ServerNetworkError || error instanceof ServerTimeoutError) {
    return true;
  }
  return error instanceof ServerApiError && error.statusCode >= 500;
}

function truncate(text: string, maxLength = 200): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

function descriptionForStatus(status: number): string {
  if (status === 400) return 'Bad request';
  if (status === 401) return 'Authentication required';
  if (status === 403) return 'Access forbidden';
  if (status === 404) return 'Not found';
  if (status === 429) return 'Rate limited';
  if (status >= 500) return 'Server error';
  return `HTTP error ${status}`;
}

export function createServerErrorFromResponse(
  status: number,
  method: string,
  url: string,
  body?: string,
): ServerApiError {
  const description = descriptionForStatus(status);
  const truncatedBody = body ? truncate(body) : undefined;
  return new ServerApiError(description, status, method, url, truncatedBody);
}
