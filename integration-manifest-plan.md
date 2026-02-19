# Surface Full Pipedream configurable_props in Integration Manifest

## Context

The LLM currently sees integration actions with **no parameter info** -- there's a bug where the server sends `params: string[]` but the extension's `IntegrationManifest` type (`chrome-extension/src/background/services/server/types.ts:133`) declares `requiredProps: string[]`. At runtime, the spread `{ ...action, appSlug }` copies the server's `params` field (not `requiredProps`), so `action.requiredProps` is always `undefined` and the fallback `?? []` at `background/index.ts:663` kicks in -- every action shows `(params: )`.

Beyond that bug, even if the field names aligned, only required parameter **names** would show -- no types, descriptions, defaults, or optional parameters.

Pipedream's `client.actions.retrieve(componentId)` returns rich `configurableProps` with type, optional, label, description, default, min/max for every parameter (e.g. Gmail's `gmail-find-email` has `maxResults`: optional integer, default 100, max 500). We should fetch this and surface it to the LLM.

**Two-repo coordination:** Steps 1-2 modify the server (`autumn-backend`). Steps 3-8 modify the extension (`autumn-extension2`). The server changes should be deployed first since the extension has fallback handling (`?? []`) for missing fields, making the transition safe in either deployment order.

## Changes

### 1. Server: Fetch full props from Pipedream and enrich the manifest

**File:** `/home/wilso/p/autumn-backend/src/shared/providers/pipedream.service.ts`

Replace the static `getManifest()` with a method that calls `client.actions.retrieve(key)` for each curated action and extracts configurable props.

```typescript
interface ManifestProp {
  name: string;
  type: string;       // "string" | "integer" | "boolean" | "object" | "string[]" | etc.
  required: boolean;
  label?: string;     // Human-readable name when different from key (e.g. key "q", label "Search Query")
  description?: string;
  default?: unknown;
  options?: string[];  // Allowed values for enum-style props (e.g. ["public_channel", "private_channel"])
  min?: number;
  max?: number;
}

interface ManifestAction {
  key: string;
  name: string;
  description: string;
  props: ManifestProp[];
}
```

**Implementation:**
- For each action key in `CURATED_INTEGRATIONS`, call `this.client.actions.retrieve(actionKey)` -- use `Promise.all` to fetch all actions in parallel rather than sequentially, since there are currently 5 actions and sequential calls would add noticeable latency
- Filter out props where `type === "app"` (auth tokens), `hidden === true`, or `disabled === true`
- Also filter out internal interface types: `$.interface.http`, `$.interface.timer`, `$.service.db` -- these are Pipedream infrastructure props, not user-facing parameters
- Map remaining props to `ManifestProp`:
  - `name`: the prop key
  - `type`: the Pipedream type string
  - `required`: `!prop.optional`
  - `label`: `prop.label` (only include if different from `name`)
  - `description`: `prop.description`
  - `default`: `prop.default`
  - `options`: if `prop.options` is a static string array, include it. If it's an async method reference (dynamic options), omit -- the LLM can't call Pipedream's option loader
  - `min`/`max`: for integer-type props
- Cache results in a `Map<string, { props: ManifestProp[]; name: string; fetchedAt: number }>` keyed by action key, with a 1-hour TTL -- props don't change often
- Fall back **per-action** to curated data if the Pipedream API call fails for an individual action -- don't let one failure invalidate all enrichment
- Make `getManifest()` async

> **[HAZARD]** First-call latency: the initial `getManifest()` request will block on 5+ concurrent Pipedream API calls before returning. Consider warming the cache at service init (call `getManifest()` in `onModuleInit`) so the first user request is fast. Severity: Medium.

**Keep the curated list** -- it defines which actions we expose. The Pipedream API just enriches the props. When falling back per-action, construct a `ManifestProp[]` from the curated `params` array by mapping each param name to `{ name, type: 'string', required: true }` (best-effort, since curated data has no types).

**Add `name` to the curated fallback data** -- the current `CuratedAction` server interface has `{ key, description, params }` but no `name`. The Pipedream API `retrieve` response provides a human-readable name. Add `name` to each curated entry as a fallback label (e.g. `name: 'Send Message to Channel'`). If using the API-enriched path, use the name from the API response.

**Update `getManifest()` return shape:**
```typescript
// Before
{ apps: { gmail: { name, nameSlug, actions: [{ key, description, params }] } } }

// After
{ apps: { gmail: { name, nameSlug, actions: [{ key, name, description, props }] } } }
```

### 2. Server: Update the controller to await async manifest

**File:** `/home/wilso/p/autumn-backend/src/modules/ai/controllers/extension-integrations.controller.ts`

Change `getManifest()` (line 68) to `async getManifest()` since the service method is now async. The NestJS controller already handles promises transparently, so just add `async` and `await`:

```typescript
@Get('manifest')
async getManifest() {
  return this.pipedreamService.getManifest();
}
```

### 3. Extension: Define `ManifestProp` in storage and update `CuratedAction`

**File:** `packages/storage/lib/settings/integrationSettings.ts`

Following the existing pattern (each settings file defines its own types inline, importing only from `../base/`), define `ManifestProp` alongside `CuratedAction`:

```diff
+export interface ManifestProp {
+  name: string;
+  type: string;
+  required: boolean;
+  label?: string;
+  description?: string;
+  default?: unknown;
+  options?: string[];
+  min?: number;
+  max?: number;
+}
+
 export interface CuratedAction {
   key: string;
   name: string;
   description: string;
   appSlug: string;
-  requiredProps: string[];
+  props: ManifestProp[];
 }
```

The re-export chain (`integrationSettings.ts` -> `settings/index.ts` via `export *` -> `lib/index.ts` -> `@extension/storage`) already exists at `packages/storage/lib/settings/index.ts:8`, so `ManifestProp` will be available as `import type { ManifestProp } from '@extension/storage'` without additional re-export changes.

### 4. Extension: Update `IntegrationManifest` to import from storage

**File:** `chrome-extension/src/background/services/server/types.ts` (lines 1, 124-137)

Following the established pattern (line 1 already has `import type { ProviderConfig } from '@extension/storage'`), import `ManifestProp` from storage and use it in `IntegrationManifest`:

```diff
-import type { ProviderConfig } from '@extension/storage';
+import type { ProviderConfig, ManifestProp } from '@extension/storage';
```

```diff
 export interface IntegrationManifest {
   apps: Record<
     string,
     {
       name: string;
       actions: Array<{
         key: string;
         name: string;
         description: string;
-        requiredProps: string[];
+        props: ManifestProp[];
       }>;
     }
   >;
 }
```

This keeps the single source of truth in `packages/storage` (the shared package) and avoids duplicate type definitions.

### 5. Extension: Update manifest -> storage flattening

**File:** `chrome-extension/src/background/index.ts` (lines 212-218)

The existing spread `{ ...action, appSlug }` at line 216 already copies all fields from the manifest action into `CuratedAction`. When the server changes from `requiredProps`/`params` to `props`, this spread will automatically pick up `props` instead.

I verified there are no other references to `requiredProps` at this site -- the only reference is at line 663, which is addressed in step 6 below. **No code changes needed here** beyond confirming the TypeScript compiler is happy after the type changes in steps 3-4.

**File:** `pages/options/src/components/IntegrationSettings.tsx` (lines 68-74)

The same flattening logic is duplicated here. The cast at line 70 (`as [string, { actions: CuratedAction[] }][]`) will continue to work because:
- The manifest actions have `{ key, name, description, props }` (from the server)
- `CuratedAction` now expects `{ key, name, description, appSlug, props }`
- The spread at line 72 (`{ ...action, appSlug }`) adds the missing `appSlug`

The cast suppresses the missing-`appSlug` type error (which already exists today). **No functional changes needed**, but the TypeScript compiler won't flag issues here due to the cast -- verify manually that the shape looks correct.

### 6. Extension: Update LLM prompt formatting

**File:** `chrome-extension/src/background/index.ts` (lines 655-670)

Replace the current formatting that joins `requiredProps` into a flat string. First, import `ManifestProp` at the top of the file (following the existing `import type { CuratedAction }` pattern):

```diff
-import { integrationSettingsStore, type CuratedAction } from '@extension/storage';
+import { integrationSettingsStore, type CuratedAction, type ManifestProp } from '@extension/storage';
```

Extract a helper function `formatProp(p: ManifestProp): string` above the `setupExecutor` function for reuse and clarity:

```typescript
function formatProp(p: ManifestProp): string {
  const displayName = p.label && p.label !== p.name ? `${p.name} "${p.label}"` : p.name;
  let s = `${displayName} (${p.type}`;
  if (p.options?.length) s += `, values: ${p.options.join('|')}`;
  if (p.default !== undefined) s += `, default: ${p.default}`;
  if (p.max !== undefined) s += `, max: ${p.max}`;
  if (p.min !== undefined) s += `, min: ${p.min}`;
  s += ')';
  return s;
}
```

Then update the formatting loop at lines 662-664:

```typescript
// Before (line 663-664)
const params = (action.requiredProps ?? []).join(', ');
lines.push(`  - ${action.key}: ${action.description} (params: ${params})`);

// After
const props = action.props ?? [];
const required = props.filter(p => p.required);
const optional = props.filter(p => !p.required);

let paramStr = '';
if (required.length > 0) {
  paramStr += `required: ${required.map(formatProp).join(', ')}`;
}
if (optional.length > 0) {
  if (paramStr) paramStr += '; ';
  paramStr += `optional: ${optional.map(formatProp).join(', ')}`;
}
lines.push(`  - ${action.key}: ${action.description} | ${paramStr}`);
```

> **[HAZARD]** Backwards compatibility during deployment: If the extension is updated before the server, `action.props` will be `undefined` (old server sends `requiredProps`/`params`, not `props`). The `action.props ?? []` fallback handles this -- actions will show with empty params, same as the current bug. Once the server is updated, props will populate. Severity: Low.

**Example LLM output (multi-app):**
```
- Slack:
  - slack-send-message-to-channel: Send a message to a Slack channel | required: channel (string), text (string)
- Gmail:
  - gmail-find-email: Search emails using Gmail query syntax | required: q "Search Query" (string); optional: maxResults (integer, default: 100, max: 500)
  - gmail-send-email: Send an email via Gmail | required: to (string), subject (string), body (string)
- Google Sheets:
  - google_sheets-add-single-row: Add a single row to a Google Sheet | required: spreadsheetId (string), sheetName (string), cells (object)
```

**Note on token budget:** With 5 curated actions and ~2-4 props each, the additional prompt size is modest (~200-300 extra tokens). The `formatProp` helper is designed to be compact -- `options` are pipe-delimited, `label` only shown when different from `name`. If the curated list grows significantly, consider truncating optional prop descriptions or limiting to required + top-N optional.

### 7. Extension: Remove "guess at optional params" planner hint

**File:** `chrome-extension/src/background/agent/prompts/templates/planner.ts` (line 110)

Remove this line (no longer needed since optional params are now explicitly listed):
```
- Integration actions may accept optional parameters beyond those listed. For search/list actions, include a reasonable result limit (e.g. maxResults).
```

### 8. Extension: Verify Options page `IntegrationSettings.tsx`

**File:** `pages/options/src/components/IntegrationSettings.tsx`

This file also does manifest flattening and uses the `CuratedAction` type.

**Changes needed:**
- The `import type { CuratedAction }` on line 8 will automatically pick up the new shape
- The type cast on line 70 (`as [string, { actions: CuratedAction[] }][]`) will work since the spread on line 72 copies all fields -- but it assumes the manifest action shape matches `CuratedAction` minus `appSlug`, which it does
- No functional changes needed, but **verify** the cast doesn't suppress type errors after `requiredProps` is removed from `CuratedAction`

The UI at lines 240-255 displays `action.name` and `action.description` but does not display `requiredProps` (and will not display `props`). No UI changes are needed for this step.

## Files modified

| File | Repo | Change |
|------|------|--------|
| `src/shared/providers/pipedream.service.ts` | autumn-backend | Fetch `configurableProps` via SDK, parallel calls, cache with 1h TTL, per-action fallback, add `name` to curated entries |
| `src/modules/ai/controllers/extension-integrations.controller.ts` | autumn-backend | Make `getManifest()` async |
| `packages/storage/lib/settings/integrationSettings.ts` | autumn-extension2 | Define `ManifestProp`, update `CuratedAction` to use `props: ManifestProp[]` |
| `chrome-extension/src/background/services/server/types.ts` | autumn-extension2 | Import `ManifestProp` from storage, update `IntegrationManifest` |
| `chrome-extension/src/background/index.ts` | autumn-extension2 | Add `formatProp` helper, update LLM prompt formatting for rich props, add `ManifestProp` import |
| `chrome-extension/src/background/agent/prompts/templates/planner.ts` | autumn-extension2 | Remove "guess optional params" hint (line 110) |
| `pages/options/src/components/IntegrationSettings.tsx` | autumn-extension2 | Verify type compatibility after `CuratedAction` change (no functional changes) |

## Verification

1. **Type check (extension only):** `pnpm -F @extension/storage type-check && pnpm -F chrome-extension type-check && pnpm -F @extension/options type-check`
2. **Build:** `pnpm -F chrome-extension build && pnpm -F @extension/sidepanel build && pnpm -F @extension/options build`
3. **Server:** Start backend, hit `GET /ai/extension/integrations/manifest` -- verify every action has `props: ManifestProp[]` with typed, described props, `label` where applicable, `options` for enum-style props, and correct `required` flags. Confirm each action has a `name` field.
4. **Integration test:** Load extension, trigger a task that uses any connected integration -- verify the planner sees full prop metadata (types, defaults, options) in the integration listing and the navigator passes correct parameters.
5. **Fallback test:** Temporarily block Pipedream API access -- verify manifest still returns with curated `params` converted to basic props as fallback.
6. **Options page:** Open `chrome-extension://*/options.html`, navigate to Integrations, click Refresh -- verify actions display correctly.
