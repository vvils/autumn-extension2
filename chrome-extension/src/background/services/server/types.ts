import type { ManifestProp, ProviderConfig } from '@extension/storage';

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

export interface ServerAgentModelAssignment {
  provider: string;
  modelName: string;
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  parameters?: Record<string, unknown>;
}

export interface PullKeysResponse {
  keys: Record<string, ProviderConfig> | null;
  agentModels?: Record<string, ServerAgentModelAssignment>;
}

export interface CreateConversationPayload {
  title: string;
  source: string;
  id?: string;
}

export interface AddMessagePayload {
  role: string;
  content: string;
  timestamp?: number;
}

export interface ConnectTokenResponse {
  token: string;
  expiresAt: string;
  connectLinkUrl: string;
}

export interface PipedreamAccount {
  id: string;
  name: string;
  app: { nameSlug: string; name: string };
  createdAt: string;
}

export interface IntegrationManifest {
  apps: Record<
    string,
    {
      name: string;
      actions: Array<{
        key: string;
        name: string;
        description: string;
        props: ManifestProp[];
      }>;
    }
  >;
}

export interface ActionRunRequest {
  actionKey: string;
  appSlug: string;
  parameters: Record<string, unknown>;
}

export interface ActionRunResult {
  success: boolean;
  data: Record<string, unknown>;
  error?: string;
}

export interface PushRatesResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface GenerateGroupQuoteParams {
  checkInDate: string;
  checkOutDate: string;
  roomCount: number;
  context?: string;
  guestName?: string;
  discountPercent?: number;
}

export interface ServerShortcut {
  id: string;
  command: string;
  prompt: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ServerQuickAction {
  id: string;
  name: string;
  prompt: string;
  description: string;
  icon: string;
  sortOrder: number;
  createdAt: string;
  updatedAt?: string;
}

export interface GroupQuoteSettingsResponse {
  success: boolean;
  data: {
    hotelInfo: { hotelName: string; contactName: string; contactEmail: string; contactPhone: string } | null;
    discountTiers: Array<{ maxOccupancy: number; discountPercent: number }>;
    emailTemplate: { greeting: string; introduction: string; closing: string; signature: string };
  };
}
