# Pipedream Connect Integration — Implementation Plan

## Context

Users want the AI agent to perform third-party service actions (Slack, Gmail, Google Sheets) via API instead of browser automation. Pipedream Connect provides managed OAuth and pre-built actions. The backend handles all Pipedream SDK interactions; the extension calls backend endpoints using the existing `ServerClient` pattern.

The options page communicates directly via `fetch()` + `serverSettingsStore` (no `chrome.runtime.sendMessage`). The background fetches integration data at init for agent prompt injection.

This plan was validated against the actual codebase patterns. Changes from original plan are marked with **[FIXED]** or **[NEW]**.

---

## Phase 1: Storage — `integrationSettings.ts`

**New file**: `packages/storage/lib/settings/integrationSettings.ts`

Follow `serverSettings.ts` 5-step pattern exactly (imports, interface, extended type, defaults + `createStorage()`, exported store).

**[FIXED]** All interfaces must be exported (consumers in `background/index.ts` and options page need `CuratedAction`, etc.):

```typescript
export interface ConnectedAccount {
  accountId: string;
  appName: string;
  appSlug: string;
  createdAt: number;
}

export interface CuratedAction {
  key: string;
  name: string;
  description: string;
  appSlug: string;
  requiredProps: string[];
}

export interface IntegrationSettingsConfig {
  connectedAccounts: ConnectedAccount[];
  availableActions: CuratedAction[];
  lastSyncedAt: number;
}
```

- Storage key: `'integration-settings'` (kebab-case per convention)
- `StorageEnum.Local`, `liveUpdate: true` (all settings use this)
- Store name: `integrationSettingsStore` (camelCase + Store suffix)
- Custom methods: `updateSettings()`, `getSettings()`, `resetToDefaults()`
- `getSettings()` must merge defaults: `{ ...DEFAULT_INTEGRATION_SETTINGS, ...settings }`

**Modify**: `packages/storage/lib/settings/index.ts` — add `export * from './integrationSettings';`

| File | Action |
|---|---|
| `packages/storage/lib/settings/integrationSettings.ts` | **New** |
| `packages/storage/lib/settings/index.ts` | Add export |

---

## Phase 2: Server Types + Client Methods

### 2a. Types

**Modify**: `chrome-extension/src/background/services/server/types.ts`

```typescript
export interface ConnectTokenResponse {
  token: string;
  expires_at: string;
  connect_link_url: string;
}

export interface PipedreamAccount {
  id: string;
  name: string;
  app: { name_slug: string; name: string };
  created_at: string;
}

export interface IntegrationManifest {
  apps: Record<string, {
    name: string;
    actions: Array<{
      key: string;
      name: string;
      description: string;
      requiredProps: string[];
    }>;
  }>;
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
```

### 2b. ServerClient Methods

**Modify**: `chrome-extension/src/background/services/server/serverClient.ts`

**[FIXED]** Add all 5 new types to the existing import block from `'./types'`:
```typescript
import type {
  ServerConversation,
  ServerMessage,
  SyncConversationPayload,
  SSEEvent,
  HotelContextManifest,
  ExtensionQueryResponse,
  ConnectTokenResponse,      // ← add
  PipedreamAccount,          // ← add
  IntegrationManifest,       // ← add
  ActionRunRequest,          // ← add
  ActionRunResult,           // ← add
} from './types';
```

Add 5 methods following existing verb patterns. Key patterns to match:
- GET: destructure `{ data }` from `this.apiClient.get<T>(path)`
- POST: `this.apiClient.post<T>(path, body)`
- DELETE: `await this.apiClient.delete(path)` returns void (existing pattern from `deleteConversation`)
- **[FIXED]** `getConnectedAccounts` and `getIntegrationManifest` should use the try/catch-return-null pattern (like `fetchHotelContext`) since these endpoints may not exist on all servers

```typescript
async createConnectToken(): Promise<ConnectTokenResponse> {
  const { data } = await this.apiClient.post<ConnectTokenResponse>(
    '/ai/extension/integrations/connect-token'
  );
  return data;
}

async getConnectedAccounts(): Promise<PipedreamAccount[]> {
  try {
    const { data } = await this.apiClient.get<PipedreamAccount[]>(
      '/ai/extension/integrations/accounts'
    );
    return data;
  } catch {
    return [];
  }
}

async disconnectAccount(accountId: string): Promise<void> {
  await this.apiClient.delete(
    `/ai/extension/integrations/accounts/${encodeURIComponent(accountId)}`
  );
}

async getIntegrationManifest(): Promise<IntegrationManifest | null> {
  try {
    const { data } = await this.apiClient.get<IntegrationManifest>(
      '/ai/extension/integrations/manifest'
    );
    return data;
  } catch {
    return null;
  }
}

async runIntegrationAction(request: ActionRunRequest): Promise<ActionRunResult> {
  const { data } = await this.apiClient.post<ActionRunResult>(
    '/ai/extension/integrations/actions/run',
    request
  );
  return data;
}
```

| File | Action |
|---|---|
| `chrome-extension/src/background/services/server/types.ts` | Add 5 interfaces |
| `chrome-extension/src/background/services/server/serverClient.ts` | Add 5 methods |

---

## Phase 3: Background — Init + Executor Wiring

**Modify**: `chrome-extension/src/background/index.ts`

### 3a. Import + Cache Variable (near line 30)

**[FIXED]** Import `type CuratedAction` alongside the store (needed by Phase 3b's `flatActions` array):

```typescript
import { integrationSettingsStore, type CuratedAction } from '@extension/storage';
let cachedIntegrationCapabilities: string | undefined;
```

### 3b. Inside `initServerClient()` — after key pull block (after line 135)

**[FIXED]** Reset stale cache: add `cachedIntegrationCapabilities = undefined;` next to the existing `cachedHotelCapabilities = undefined;` on line 114.

**[FIXED]** Insertion point is after the key pull try/catch (line 135), not after line 123. Line 123 ends the hotel context block, but lines 125-135 contain the key pull block — both are inside `isAuthenticated()`.

Fetch integration data, store in chrome storage, build capabilities string:

```typescript
try {
  const accounts = await serverClient.getConnectedAccounts();
  const manifest = await serverClient.getIntegrationManifest();
  if (manifest) {
    const flatActions: CuratedAction[] = [];
    for (const [appSlug, app] of Object.entries(manifest.apps)) {
      for (const action of app.actions) {
        flatActions.push({ ...action, appSlug });
      }
    }
    await integrationSettingsStore.updateSettings({
      connectedAccounts: accounts.map(a => ({
        accountId: a.id,
        appName: a.app.name,
        appSlug: a.app.name_slug,
        createdAt: new Date(a.created_at).getTime(),
      })),
      availableActions: flatActions,
      lastSyncedAt: Date.now(),
    });
    const connectedSlugs = new Set(accounts.map(a => a.app.name_slug));
    const lines: string[] = [];
    for (const [appSlug, app] of Object.entries(manifest.apps)) {
      if (!connectedSlugs.has(appSlug)) continue;
      lines.push(`- ${app.name}:`);
      for (const action of app.actions) {
        lines.push(`  - ${action.key}: ${action.description} (params: ${action.requiredProps.join(', ')})`);
      }
    }
    if (lines.length > 0) cachedIntegrationCapabilities = lines.join('\n');
  }
} catch (error) {
  logger.warning('Failed to fetch integration data:', error);
}
```

### 3c. In `setupExecutor()` — `new Executor(...)` options (line ~579)

Add alongside `hotelCapabilities`:

```typescript
connectedIntegrations: cachedIntegrationCapabilities,
```

| File | Action |
|---|---|
| `chrome-extension/src/background/index.ts` | Import, cache var, init fetch, executor arg |

---

## Phase 4: Agent System

### 4a. Action Schema

**Modify**: `chrome-extension/src/background/agent/actions/schemas.ts`

**[FIXED]** Include `app_slug` as an explicit field instead of deriving it from `action_key.split('-')` (which is fragile and format-dependent):

```typescript
export const runIntegrationActionSchema: ActionSchema = {
  name: 'run_integration_action',
  description: 'Execute an action on a connected third-party service (e.g. Slack, Gmail, Google Sheets)',
  schema: z.object({
    action_key: z.string().describe('the action key from the available integrations list'),
    app_slug: z.string().describe('the app slug for the target service'),
    parameters: z.record(z.unknown()).describe('parameters required by the action'),
  }),
};
```

### 4b. Action Handler

**Modify**: `chrome-extension/src/background/agent/actions/builder.ts`

**[FIXED]** Add `runIntegrationActionSchema` to the existing schema import block (lines 3-26):
```typescript
import {
  // ... existing 16 schemas ...
  queryHotelDataActionSchema,
  runIntegrationActionSchema,  // ← add
} from './schemas';
```

**[FIXED]** Add `connectedIntegrations` as a fourth constructor parameter so the action is only registered when integrations are actually connected (avoids polluting the navigator's action schema when no services are available):

```typescript
export class ActionBuilder {
  private readonly context: AgentContext;
  private readonly extractorLLM: BaseChatModel;
  private readonly serverClient: ServerClient | null;
  private readonly connectedIntegrations?: string;  // ← add

  constructor(
    context: AgentContext,
    extractorLLM: BaseChatModel,
    serverClient?: ServerClient | null,
    connectedIntegrations?: string,  // ← add
  ) {
    this.context = context;
    this.extractorLLM = extractorLLM;
    this.serverClient = serverClient ?? null;
    this.connectedIntegrations = connectedIntegrations;  // ← add
  }
```

After `queryHotelData` block, **in a separate guard** `if (this.serverClient && this.connectedIntegrations)` (not inside the existing `if (this.serverClient)` block):

```typescript
if (this.serverClient && this.connectedIntegrations) {
  const serverClient = this.serverClient;
  const context = this.context;
  const runIntegration = new Action(
  async (params: { action_key: string; app_slug: string; parameters: Record<string, unknown> }) => {
    try {
      context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, t('act_runIntegration_start'));
      const result = await serverClient.runIntegrationAction({
        actionKey: params.action_key,
        appSlug: params.app_slug,
        parameters: params.parameters,
      });
      if (!result.success) {
        context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, result.error ?? 'Action failed');
        return new ActionResult({ error: result.error, includeInMemory: true });
      }
      const summary = JSON.stringify(result.data).slice(0, 2000);
      context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, t('act_runIntegration_ok'));
      return new ActionResult({ extractedContent: summary, includeInMemory: true });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
      return new ActionResult({
        extractedContent: `[Integration action failed: ${errorMsg}]`,
        error: errorMsg,
        includeInMemory: true,
      });
    }
  },
  runIntegrationActionSchema,
);
  actions.push(runIntegration);
}
```

Key design choices matching existing patterns:
- **[FIXED]** Uses `app_slug` from params instead of splitting `action_key`
- **[FIXED]** Truncates `JSON.stringify(result.data)` to 2000 chars to prevent memory bloat
- **[FIXED]** On error, sets both `extractedContent` and `error` (matches `queryHotelData` dual-error pattern)
- Follows event emission pattern: `ACT_START` → `ACT_OK`/`ACT_FAIL`

### 4c. Executor — Add `connectedIntegrations` to ExtraArgs

**Modify**: `chrome-extension/src/background/agent/executor.ts`

- Add to `ExecutorExtraArgs` (line 38): `connectedIntegrations?: string;`
- **[FIXED]** Pass `connectedIntegrations` to `ActionBuilder` constructor (line ~72):
  ```typescript
  const actionBuilder = new ActionBuilder(context, extractorLLM, this.serverClient, extraArgs?.connectedIntegrations);
  ```
- Update `PlannerPrompt` construction (line 76):
  ```typescript
  this.plannerPrompt = new PlannerPrompt(!!this.serverClient, extraArgs?.hotelCapabilities, extraArgs?.connectedIntegrations);
  ```

### 4d. Planner Prompt — Integration Awareness

**Modify**: `chrome-extension/src/background/agent/prompts/planner.ts`

Add third constructor param:
```typescript
constructor(
  private readonly serverAvailable = false,
  private readonly hotelCapabilities?: string,
  private readonly connectedIntegrations?: string,
) { super(); }
```

Pass to template:
```typescript
buildPlannerSystemPrompt({
  serverAvailable: this.serverAvailable,
  hotelCapabilities: this.hotelCapabilities,
  connectedIntegrations: this.connectedIntegrations,
})
```

**Modify**: `chrome-extension/src/background/agent/prompts/templates/planner.ts`

Add `connectedIntegrations?: string` to `BuildPlannerSystemPromptOptions`.

Extract from options: `const connectedIntegrations = options?.connectedIntegrations;`

In the `serverAvailable` responsibilities section (after the hotel capabilities injection on line 16), append:

**[FIXED]** Prompt injection rewritten as an instruction paragraph instead of a bullet that mimics the task_type list (avoids LLM emitting `task_type: "integration"` which the Zod schema would reject):

```typescript
${connectedIntegrations ? `\n   When the task involves one of these connected third-party services, prefer using run_integration_action over browser automation. Route as task_type "browser" so the navigator can execute the action:\n${connectedIntegrations}` : ''}
```

**Important**: This does NOT add a new task_type. Integration actions route through the existing `browser` task type since the navigator executes them. The prompt just tells the planner to prefer the integration action over browser automation when the service is connected.

| File | Action |
|---|---|
| `chrome-extension/src/background/agent/actions/schemas.ts` | Add schema |
| `chrome-extension/src/background/agent/actions/builder.ts` | Add action handler (inside `serverClient` guard) |
| `chrome-extension/src/background/agent/executor.ts` | Add `connectedIntegrations` to ExtraArgs + PlannerPrompt |
| `chrome-extension/src/background/agent/prompts/planner.ts` | Add third constructor param |
| `chrome-extension/src/background/agent/prompts/templates/planner.ts` | Add to options + inject into prompt |

---

## Phase 5: Options Page — Integrations Tab

### 5a. Tab Registration

**Modify**: `pages/options/src/Options.tsx`

- Import `FiLink` from `react-icons/fi` (line 6, add to existing import)
- Import component: `import { IntegrationSettings } from './components/IntegrationSettings';`
- Add to `TabTypes` union (line 13): `| 'integrations'`
- Add to `TABS` array (after `'server'` entry, before `'help'`):
  ```typescript
  { id: 'integrations', icon: FiLink, label: t('options_integrations_tab') },
  ```
- Add case in `renderTabContent()`:
  ```typescript
  case 'integrations': return <IntegrationSettings isDarkMode={isDarkMode} />;
  ```

### 5b. IntegrationSettings Component

**New file**: `pages/options/src/components/IntegrationSettings.tsx`

Follow `ServerSettings.tsx` patterns:
- Props: `{ isDarkMode?: boolean }` defaulting to `false`
- Styling: same `cardClass`/`headingClass`/`btnPrimary` variables
- Layout: `<section className="space-y-6">` with card `<div>`s
- Data loading: `useEffect(() => { store.getSettings().then(setSettings); }, [])`

**Key behavior**:
- On mount: load from `integrationSettingsStore` + `serverSettingsStore` (for URL/token)
- Gate all sections on `hasServerUrl && isAuthenticated` (same pattern as ServerSettings)
- **[FIXED]** Auth headers: read `accessToken` from `serverSettingsStore.getSettings()` and attach as `Authorization: Bearer ${token}` on all fetch calls to integration endpoints
- **Connected Services section**: list accounts with disconnect button
- **Connect New Service section**: button calls `POST /ai/extension/integrations/connect-token` with auth header → opens `connect_link_url` via `window.open()`
- **Refresh button**: re-fetches accounts + manifest, updates `integrationSettingsStore`
- **Available Actions section**: read-only list grouped by app

**[NEW]** Helper for authenticated fetch (reusable within the component):
```typescript
const serverFetch = async (path: string, options?: RequestInit) => {
  const { serverUrl, accessToken } = await serverSettingsStore.getSettings();
  return fetch(`${serverUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...options?.headers,
    },
    signal: options?.signal ?? AbortSignal.timeout(10_000),
  });
};
```

### 5c. i18n Keys

**[FIXED]** Must add to ALL THREE locale files (en, pt_BR, zh_TW) — `MessageKey` is the intersection type.

**Modify**: `packages/i18n/locales/en/messages.json`
**Modify**: `packages/i18n/locales/pt_BR/messages.json`
**Modify**: `packages/i18n/locales/zh_TW/messages.json`

Keys to add (shown in English; pt_BR/zh_TW get the same keys with translated messages):

| Key | English message |
|---|---|
| `options_integrations_tab` | "Integrations" |
| `options_integrations_title` | "Third-Party Integrations" |
| `options_integrations_connectedServices` | "Connected Services" |
| `options_integrations_connectNew` | "Connect a Service" |
| `options_integrations_connectBtn` | "Connect" |
| `options_integrations_disconnectBtn` | "Disconnect" |
| `options_integrations_refreshBtn` | "Refresh" |
| `options_integrations_emptyState` | "No services connected yet" |
| `options_integrations_availableActions` | "Available Actions" |
| `options_integrations_connectingInfo` | "You'll be redirected to authorize access" |
| `act_runIntegration_start` | "Running integration action..." |
| `act_runIntegration_ok` | "Integration action completed" |

| File | Action |
|---|---|
| `pages/options/src/Options.tsx` | Add tab + import |
| `pages/options/src/components/IntegrationSettings.tsx` | **New** |
| `packages/i18n/locales/en/messages.json` | Add 12 i18n keys |
| `packages/i18n/locales/pt_BR/messages.json` | Add 12 i18n keys (Portuguese) |
| `packages/i18n/locales/zh_TW/messages.json` | Add 12 i18n keys (Chinese) |

---

## Hazards & Mitigations

| # | Hazard | Severity | Mitigation |
|---|---|---|---|
| H1 | **Stale integration cache**: connecting a new service via options page doesn't update `cachedIntegrationCapabilities` in the background | Medium | Acceptable for v1 — same limitation as hotel context. User refreshes via options page, data persists in `integrationSettingsStore`. Next task setup reads fresh cache on service worker restart. |
| H2 | **`appSlug` derivation from action_key split** | High | **[FIXED]** — `app_slug` is now a separate schema field. The LLM provides both `action_key` and `app_slug` from the prompt context. |
| H3 | **Result data size bloat** in agent memory | Medium | **[FIXED]** — truncate `JSON.stringify(result.data)` to 2000 chars. |
| H4 | **Options page fetch without auth** | High | **[FIXED]** — `serverFetch` helper attaches `Authorization: Bearer` header from `serverSettingsStore`. |
| H5 | **i18n type-check failure** from missing locale keys | High | **[FIXED]** — keys added to all three locale files (en, pt_BR, zh_TW). |
| H6 | **OAuth flow completion detection** | Low | Manual "Refresh" button. No polling needed for v1. User clicks Refresh after completing OAuth. |
| H7 | **Agent attempts action for disconnected service** | Low | Server rejects with error. `ActionResult.error` feeds back to agent. Planner prompt only lists connected services. |

---

## All Files Summary

| File | Action | Phase |
|---|---|---|
| `packages/storage/lib/settings/integrationSettings.ts` | **New** | 1 |
| `packages/storage/lib/settings/index.ts` | Add export | 1 |
| `chrome-extension/src/background/services/server/types.ts` | Add 5 interfaces | 2 |
| `chrome-extension/src/background/services/server/serverClient.ts` | Add 5 methods | 2 |
| `chrome-extension/src/background/index.ts` | Import, cache var, init fetch, executor arg | 3 |
| `chrome-extension/src/background/agent/actions/schemas.ts` | Add schema | 4 |
| `chrome-extension/src/background/agent/actions/builder.ts` | Add action handler | 4 |
| `chrome-extension/src/background/agent/executor.ts` | Add `connectedIntegrations` to ExtraArgs | 4 |
| `chrome-extension/src/background/agent/prompts/planner.ts` | Add constructor param | 4 |
| `chrome-extension/src/background/agent/prompts/templates/planner.ts` | Add to template | 4 |
| `pages/options/src/Options.tsx` | Add tab | 5 |
| `pages/options/src/components/IntegrationSettings.tsx` | **New** | 5 |
| `packages/i18n/locales/en/messages.json` | Add 12 keys | 5 |
| `packages/i18n/locales/pt_BR/messages.json` | Add 12 keys | 5 |
| `packages/i18n/locales/zh_TW/messages.json` | Add 12 keys | 5 |

Total: 2 new files, 13 modified files.

---

## Verification

### Type Checking
```bash
pnpm -F packages/storage type-check
pnpm -F chrome-extension type-check
pnpm -F pages/options type-check
```

### Linting
```bash
pnpm -F chrome-extension lint
pnpm -F pages/options lint
pnpm -F packages/storage lint
```

### i18n Regeneration
```bash
pnpm -F @extension/i18n genenrate-i8n
```

### Build
```bash
pnpm build
```

### Manual E2E
1. Set server URL in options → log in → "Integrations" tab appears
2. Click "Connect" → Pipedream OAuth opens in new tab → complete flow
3. Click "Refresh" → account appears → available actions listed
4. Side panel: "Send a message to #general on Slack" → planner routes as browser task → navigator uses `run_integration_action` → result in chat
5. Disconnect account → refresh → verify agent no longer offers that integration

---

## Audit Fixes Applied

The following issues were found during codebase audit and have been incorporated inline (marked with **[FIXED]**):

| # | Finding | Severity | Fix Location |
|---|---------|----------|--------------|
| F1 | Missing `type CuratedAction` import in `background/index.ts` | **High** | Phase 3a |
| F2 | Missing `cachedIntegrationCapabilities = undefined` reset in `initServerClient()` | **Medium** | Phase 3b |
| F3 | Insertion point said "after line 123" but should be "after line 135" (after key pull block) | **Medium** | Phase 3b |
| F4 | Missing `runIntegrationActionSchema` import in `builder.ts` | **High** | Phase 4b |
| F5 | Missing 5 new type imports in `serverClient.ts` | **High** | Phase 2b |
| F6 | Planner prompt injection looked like a `task_type` option (LLM confusion risk) | **Low** | Phase 4d |
| F7 | Storage interfaces not exported (`export interface` needed) | **Medium** | Phase 1 |
| F8 | `run_integration_action` registered even when no services connected (schema noise) | **Medium** | Phase 4b, 4c |
