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

export interface ServerConversation {
  id: string;
  title: string;
  firstMessagePreview: string;
  lastMessageAt: string;
  messageCount: number;
  createdAt: string;
  source?: string;
}

export interface ServerMessage {
  id: string;
  role: string;
  content: string;
  parts?: Array<{ type: string; data?: unknown; text?: string }>;
  createdAt: string;
}

export interface SyncConversationPayload {
  conversationId: string;
  title: string;
  source: string;
  messages: Array<{ role: string; content: string; timestamp: number }>;
}

export interface HotelContextManifest {
  hotel: {
    name: string;
    timezone: string;
    currentDate: string;
    currency: { code: string; symbol?: string };
    roomTypes: string[];
  };
  capabilities: Array<{
    name: string;
    description: string;
    examples: string[];
  }>;
  flags: {
    hasCompetitorData: boolean;
    hasMarketingIntegration: boolean;
    isMarketingOnly: boolean;
  };
}

export interface ExtensionQueryResponse {
  text: string | null;
  sources: string[];
  latency: number;
  escalation: { reason: string } | null;
}
