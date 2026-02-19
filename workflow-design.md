# Extension AI Copilot — Workflow Design Document

## Context

The browser extension has a working AI copilot (planner → navigator step loop) and Pipedream integration (Gmail, Slack, Google Sheets). Two new end-to-end workflows need design: OTA Price Parity and Group Bookings via Email. The Gmail manifest actions (find, get, send) are already added. This document details the full implementation path for each workflow.

---

## Current Architecture (How It Works Today)

### Extension Agent Pipeline

The entire agent system runs **locally in the extension** background service worker. There is no separate backend chat pipeline for task execution.

```
User message → background/index.ts (port message: "new_task")
  → setupExecutor() creates Executor with PlannerAgent + NavigatorAgent
  → Executor.execute():
    Phase 1: PlannerAgent classifies → TaskType.GENERAL | DOMAIN_QUERY | BROWSER
    Phase 2: If DOMAIN_QUERY → serverClient.streamChat() → SSE (chunk/widget/escalate/done)
    Phase 3: If GENERAL → planner answers directly (done=true)
    Phase 4: If BROWSER → planner + navigator step loop
```

**Key files:**
- `chrome-extension/src/background/agent/executor.ts` — orchestrator
- `chrome-extension/src/background/agent/agents/planner.ts` — task classification + strategic planning
- `chrome-extension/src/background/agent/agents/navigator.ts` — action execution
- `chrome-extension/src/background/agent/actions/builder.ts` — registers all navigator actions
- `chrome-extension/src/background/agent/actions/schemas.ts` — Zod schemas for actions
- `chrome-extension/src/background/agent/prompts/templates/planner.ts` — planner system prompt

### Key Routing Decision (Planner — runs locally, NOT on backend)

```typescript
// agents/planner.ts — TaskType enum
enum TaskType {
  GENERAL = 'general',        // Answer directly
  DOMAIN_QUERY = 'domain_query', // Route to backend SSE synthesizer
  BROWSER = 'browser',        // Navigate + execute browser/integration actions
}
```

- `task_type: 'general'` → planner answers directly, done=true
- `task_type: 'domain_query'` → SSE stream from backend via `serverClient.streamChat()`; if backend sends `escalate` event → falls through to browser loop
- `task_type: 'browser'` → planner+navigator step loop (includes integration actions)

### Integration Actions (Executed Within Navigator Step Loop)

Integration actions are registered as the `run_integration_action` navigator action (in `ActionBuilder.buildDefaultActions()`, inside the `if (this.serverClient && this.connectedIntegrations)` block). The planner tells the navigator to use it via `next_steps`, and the navigator calls `serverClient.runIntegrationAction()` during the step loop.

> **[HAZARD]** Integration actions are executed **within** the navigator's action loop, not as standalone calls from the extension UI. The planner sets `task_type: 'browser'` and the navigator executes `run_integration_action`. This affects how multi-step orchestration must be designed. Severity: High.

**How integration context reaches agents** (via `initServerClient()` in `background/index.ts`):
1. On startup/auth, fetches `getConnectedAccounts()` and `getIntegrationManifest()`
2. Builds a text string of connected capabilities (app name + action keys + descriptions + params)
3. Passes to `Executor` → `PlannerPrompt` (as `CONNECTED INTEGRATIONS` section) and `ActionBuilder`
4. Planner prompt instructs: "ALWAYS prefer integration actions over browser automation" (in the `CONNECTED INTEGRATIONS` section of `buildPlannerSystemPrompt()`)

### Domain Query + Escalation (`Executor.executeDomainQuery()`)

When `task_type === 'domain_query'`, the executor streams SSE from `POST /ai/extension/chat`. If backend sends `escalate` event, the executor falls through to the browser step loop and re-runs the planner.

### Existing Group Quotes Module (Backend)

- `POST /group-quotes/generate` — full quote generation with AI room allocation, pricing, email draft
- `POST /group-quotes/parse-inquiry` — AI extracts structured data from raw email text
- Uses `usersService.fetchDayMetrics()` for real room type prices per night
- Consecutive availability algorithm ensures guests keep same room for entire stay
- Occupancy-based discount tiers (configurable per user)
- AI-generated email drafts with template system

---

## Workflow 1: OTA Price Parity

**Goal:** User says "Check my rate parity" → extension queries backend for current direct rates, scrapes Google for OTA prices, compares variance, and presents report.

### Step-by-Step Flow

1. **User:** "Check my OTA price parity for this weekend"

2. **Extension PlannerAgent** (runs locally):
   - Classifies as `task_type: 'browser'`
   - `next_steps`: "First use `query_hotel_data` to fetch current direct rates and pricing config. Then search Google for OTA prices for this hotel."

   > Note: The planner cannot simultaneously request backend data AND start browser scraping. The navigator must execute `query_hotel_data` as a first action in the step loop, then proceed to Google scraping.

3. **Browser Step Loop begins:**

   **Step 1** — Navigator executes `query_hotel_data` action (registered in the `if (this.serverClient)` block of `buildDefaultActions()`):
   - Calls `serverClient.queryData("current rates and pricing config for this weekend")`
   - Endpoint: `POST /ai/extension/query`
   - Returns pricing data (floors, ceilings, current rates, occupancy)
   - Navigator caches results via `cache_content`

   **Step 2** — Navigator executes `search_google` action:
   - Searches `"{hotel name} hotel prices {check-in} to {check-out}"`
   - Reads page state, extracts price data from Google hotel card

   > **[HAZARD]** Google hotel price cards are not guaranteed to appear and their DOM structure changes without notice. The planner prompt must include a fallback strategy: if no Google price card is found, navigate directly to booking.com and expedia.com to extract rates. Severity: High.

   **Step 3+** — Navigator extracts OTA prices:
   - If Google card found: extracts prices per channel
   - If not: navigates to individual OTA sites (booking.com, expedia.com, hotels.com)
   - Caches findings via `cache_content`

   **Step 4** — Navigator calls `done` with comparison report:
   ```
   Rate Parity Report — Fri Feb 20:
   ✓ Booking.com: $189 (matches Direct)
   ✗ Expedia: $175 (−$14, 7.4% below Direct)
   ✓ Hotels.com: $189 (matches Direct)
   Recommendation: Your Expedia rate is undercutting direct by $14.
   ```

4. **PlannerAgent validates completion** (runs every `planningInterval` steps):
   - Confirms done=true, sets `final_answer` with formatted report

5. **If rate adjustment needed** (future iteration):
   - Option A (PMS API): Requires new backend endpoint exposing the PMS rate update capability. The backend already has `PmsFactory` at `shared/providers/pms/pms.factory.ts` supporting Mews, CloudBeds, and ResNexus. The `PmsProvider` interface exposes `updateRatePricing(accessToken, rates[])` and `updateRates({priceUpdates, rateId, accessToken, timezone})`. The Mews provider (`mews.provider.ts`) implements these via the Mews `rates/updatePrice` API with timezone conversion and 1000-item chunking. A new navigator action would call a backend endpoint that delegates to `PmsFactory.getProvider().updateRates()` — the factory is backend-internal and not directly exposed via API today.
   - Option B (Browser): Navigator automates Mews/PMS extranet
   - Deferred — not part of initial implementation

### Backend Changes Needed: NONE

All required capabilities exist:
- `query_hotel_data` action → `POST /ai/extension/query` (returns rates, floors, ceilings, occupancy)
- Hotel context manifest provides hotel name, room types, currency
- `search_google`, `cache_content`, `done` actions are all registered

### Extension Changes Needed

1. **Planner prompt enhancement** (`prompts/templates/planner.ts`):
   - Add rate parity workflow hints in a **new `serverAvailable`-gated section** (NOT inside `connectedIntegrations`). Rate parity uses `query_hotel_data` (requires `serverClient`) and `search_google` (always available) — it does NOT require connected integrations. If placed inside `connectedIntegrations`, the hints disappear when a user has `serverAvailable=true` but no Pipedream integrations connected.
   - Placement: after the responsibilities section, before `CONNECTED INTEGRATIONS`, gated on `serverAvailable`
   - Include example: "For rate parity, first query_hotel_data for current rates, then search Google for OTA prices"
   - Include fallback guidance: "If Google hotel card not found, navigate to individual OTA sites"

2. **No new actions needed** — all exist:
   - `query_hotel_data` (registered in `if (this.serverClient)` block of `buildDefaultActions()`)
   - `search_google`, `go_to_url`, `cache_content`, `done` (registered unconditionally in `buildDefaultActions()`)

### Relevant Backend Capabilities (Already Exist)

| Capability | Location | What It Provides |
|---|---|---|
| Current rates by date | `query_hotel_data` → `POST /ai/extension/query` | Floors, ceilings, AI prices, occupancy |
| Room type rates | `usersService.fetchDayMetrics()` | Per-room-type daily pricing |
| Competitor rates | `getPricingConfig` | Rate shop data if configured |
| Push rates to PMS | `PmsFactory` → `PmsProvider.updateRates()` | API-based rate updates via Mews/CloudBeds/ResNexus (future — not exposed via API yet, see `shared/providers/pms/`) |
| Hotel context | `GET /ai/extension/context` | Hotel name, timezone, currency, room types |

---

## Workflow 2: Group Bookings via Email

**Goal:** User says "Check my inbox for group booking requests" → searches Gmail → summarizes inquiries → generates quote → drafts reply → sends email. All orchestrated through the extension copilot.

### Step-by-Step Flow

1. **User:** "Check my email for group booking requests"

2. **Extension PlannerAgent:**
   - Sees Gmail in `CONNECTED INTEGRATIONS` section of prompt
   - Classifies as `task_type: 'browser'` (integration actions route through navigator)
   - `next_steps`: "Use run_integration_action with action_key 'gmail-find-email', app_slug 'gmail', parameters: { q: 'subject:(group booking OR block OR reservation request) is:unread newer_than:30d' }"

3. **Navigator executes `run_integration_action`:**
   ```json
   { "action_key": "gmail-find-email", "app_slug": "gmail",
     "parameters": { "q": "subject:(group booking OR block) is:unread newer_than:30d" } }
   ```
   → Calls `serverClient.runIntegrationAction()` → `POST /ai/extension/integrations/actions/run`
   → Returns: list of matching emails (IDs, snippets, from, subject, date)

   > **[HAZARD — Truncation]** Integration action results are truncated to 2000 characters (hardcoded in `run_integration_action` handler). A list of emails may fit, but full email bodies and quote responses will not. This limit must be extracted to a named constant (`INTEGRATION_RESULT_MAX_LENGTH`) and increased to ~8000 characters. Severity: Critical.

4. **Navigator presents results via `ask_user` or `done`:**
   ```
   Found 3 unread group booking inquiries:
   1. From: sarah@weddings.com — 'Wedding Block Request - June 2026' (Feb 15)
   2. From: mike@corp.com — 'Annual Retreat 20 rooms' (Feb 12)
   3. From: events@reunion.org — 'Family Reunion Accommodation' (Feb 10)

   Which one would you like me to work on?
   ```

   > **[HAZARD — ask_user constraint]** The navigator prompt states: "ask_user should always be the only action in a step — do NOT combine it with other actions." The group booking workflow requires `ask_user` after parsing (step 8) and after quote generation (step 11). The planner guidance should explicitly note this constraint. Severity: Low.

5. **User:** "Start with the wedding one"

6. **Navigator executes `run_integration_action`:**
   ```json
   { "action_key": "gmail-get-email", "app_slug": "gmail",
     "parameters": { "message_id": "<id>" } }
   ```
   → Returns: full email body text

7. **Navigator calls `parse_group_inquiry` action:**
   ```json
   { "emailText": "<full email body>" }
   ```
   → Calls `serverClient.parseGroupInquiry(params.emailText)`
   → Backend wraps response: `{ success: true, data: ParsedInquiryData }`
   → `ParsedInquiryData` uses per-field confidence objects:
   ```typescript
   {
     checkInDate?: { value: string | null, confidence: 'high' | 'medium' | 'low' },
     checkOutDate?: { value: string | null, confidence: 'high' | 'medium' | 'low' },
     roomCount?: { value: number | null, confidence: 'high' | 'medium' | 'low' },
     contactInfo?: { name?: string | null, email?: string | null, phone?: string | null }
   }
   ```
   Note: The backend intentionally does NOT extract `guestCount`, `eventType`, or `specialRequirements` here — those are handled by the allocation AI in `generate_group_quote` which reads the raw email via the `context` parameter.

   > **[HAZARD — Missing actions]** No navigator action currently exists for calling `/group-quotes/parse-inquiry` or `/group-quotes/generate`. The `run_integration_action` only calls Pipedream actions, and `query_hotel_data` only calls `/ai/extension/query`. **New navigator actions must be added.** Severity: Critical.
   > Mitigation: Add `parse_group_inquiry` and `generate_group_quote` actions in `builder.ts`, following the `queryHotelData` pattern (registered in the `if (this.serverClient)` block). These call `ServerClient` convenience methods, not `apiClient.post()` directly.

   > **[HAZARD — Error recovery]** If `parse_group_inquiry` returns low confidence, the navigator needs guidance. Each action handler should return descriptive error messages, e.g.: `"Parsed inquiry but confidence is low for dates. Ask the user to confirm: checkIn=June 12, checkOut=June 15"`. The navigator prompt already handles error recovery ("If stuck, try alternative approaches"). Severity: Medium.

8. **Navigator presents parsed data via `ask_user`:**
   ```
   Here's what I extracted from Sarah's email:
   • Check-in: 2026-06-12 (high confidence)
   • Check-out: 2026-06-15 (high confidence)
   • Rooms: 25 (medium — email says 'about 25')
   • Contact: Sarah (sarah@weddings.com)

   The email also mentions it's a wedding with ADA room needs —
   I'll pass that context to the quote generator for smart room allocation.

   Shall I generate a quote with these details?
   ```

9. **User:** "Yes, go ahead"

10. **Navigator calls `generate_group_quote` action:**
    ```json
    { "checkInDate": "2026-06-12", "checkOutDate": "2026-06-15",
      "roomCount": 25, "context": "<original email text>", "guestName": "Sarah" }
    ```
    → Calls `serverClient.generateGroupQuote(params)`
    → Backend wraps response: `{ success: true, data: { allocation, metrics, emailDraft } }`

    Behind the scenes (backend):
    a. Fetches real room type prices via `fetchDayMetrics` for Jun 12-14
    b. Calculates consecutive availability (min unsold across 3 nights)
    c. AI allocates rooms semantically (wedding → king beds, ADA room)
    d. Applies occupancy-based discount (e.g., 10% at 45% occupancy)
    e. Generates email draft with quote summary

    > **[HAZARD — Context loss]** The original email text from Step 6 may be lost from navigator context by Step 10 due to message history truncation and the action result size limit. The navigator should cache the full email text immediately via `cache_content` after retrieval, and the parse/generate steps should execute in quick succession. Severity: Medium.

    > **[HAZARD — Response size]** The `generate_group_quote` response contains allocation data for potentially 25+ rooms across multiple nights, plus pricing metrics, plus a full email draft. This can easily exceed 4000+ characters. When returned as `extractedContent` in `ActionResult`, it gets included in the navigator's message history. Large values consume context window tokens and may push earlier context out of the message window. Severity: Medium.
    > Mitigation: The action handler should summarize the allocation data and return a condensed version (key metrics + truncated email preview) as `extractedContent`, or instruct the navigator to cache the full result via a follow-up `cache_content` action.

11. **Navigator presents quote via `ask_user`:**
    ```
    Quote generated for Sarah's wedding block:
    • 25 rooms × 3 nights = 75 room-nights
    • Group ADR: $165/night (10% off retail $183)
    • Total revenue: $12,375
    • Occupancy impact: 52% → 68%

    Email draft ready. Want me to send it, or would you like changes?
    ```

12. **User:** "Send it"

13. **Navigator executes `run_integration_action`:**
    ```json
    { "action_key": "gmail-send-email", "app_slug": "gmail",
      "parameters": {
        "to": "sarah@weddings.com",
        "subject": "Group Quote for Jun 12–15 at [Hotel Name]",
        "body": "<generated email text>"
      } }
    ```
    → Email sent via user's Gmail account

### Backend Changes Needed: NONE

All required backend capabilities already exist:
- `gmail-find-email` / `gmail-get-email` / `gmail-send-email` — in Pipedream manifest
- `POST /group-quotes/parse-inquiry` — parses raw email text with AI
- `POST /group-quotes/generate` — generates full quote with allocation, pricing, email draft
- `POST /ai/extension/integrations/actions/run` — executes Pipedream actions

### Extension Changes Needed

1. **New navigator actions** (in `actions/builder.ts` and `actions/schemas.ts`):

   Both actions follow the `queryHotelData` pattern: registered in the `if (this.serverClient)` block of `buildDefaultActions()`, with closure-captured locals (`const serverClient = this.serverClient; const context = this.context;`). Neither action includes an `intent` field — matching the `queryHotelData` and `runIntegrationAction` convention where server-calling actions omit `intent`.

   a. `parse_group_inquiry`:
   - Schema: `{ emailText: z.string().describe('Full text of the group booking inquiry email') }`
   - Handler: `serverClient.parseGroupInquiry(params.emailText)`
   - Conditionally registered when `serverClient` exists
   - **Response formatting:** The handler checks `result.success`, then iterates the per-field confidence objects in `result.data` to build a human-readable summary with confidence indicators. Example `extractedContent`: `"Parsed inquiry: checkIn=2026-06-12 (high), checkOut=2026-06-15 (high), roomCount=25 (medium), contact=Sarah (sarah@weddings.com). Low-confidence fields should be confirmed with the user."` Note: eventType and specialRequirements are NOT in the parse response — those are handled by the allocation AI when generating the quote via the `context` parameter.

   b. `generate_group_quote`:
   - Schema: `{ checkInDate: z.string().describe('...'), checkOutDate: z.string().describe('...'), roomCount: z.number().describe('...'), context: z.string().optional().describe('...'), guestName: z.string().optional().describe('...') }`
   - Handler: `serverClient.generateGroupQuote(params)`
   - Conditionally registered when `serverClient` exists
   - **Response summarization:** The full response (allocation + metrics + email draft) can exceed 4000+ characters. The handler should build a condensed `extractedContent` string containing: key metrics (room count, ADR, total revenue, occupancy impact) + truncated email preview (first 500 chars + "..."). The full email draft should be included as a note instructing the navigator to cache it via `cache_content` for later retrieval when sending via `gmail-send-email`.

2. **Increase integration result truncation limit** (in `run_integration_action` handler in `builder.ts`):
   - Extract to a **module-level** named constant at the top of `builder.ts`: `const INTEGRATION_RESULT_MAX_LENGTH = 8000;` (module-level so it can be reused by other action handlers if needed)
   - Current: `raw.length > 2000 ? raw.slice(0, 2000) + '... (truncated)'`
   - Change to: `raw.length > INTEGRATION_RESULT_MAX_LENGTH ? raw.slice(0, INTEGRATION_RESULT_MAX_LENGTH) + '... (truncated)'`

3. **Planner prompt update** (`prompts/templates/planner.ts`):

   Workflow hints must be split into two separate conditional sections based on their dependencies:

   a. **Rate parity hints** — gated on `serverAvailable` (new conditional block, placed AFTER the responsibilities section and BEFORE the `CONNECTED INTEGRATIONS` section):
      ```
      # WORKFLOW HINTS:
      - Rate parity check: use query_hotel_data for current direct rates first, then search_google for OTA prices. If no Google hotel card appears, navigate directly to booking.com and expedia.com to extract rates.
      ```
      This is gated on `serverAvailable` (not `connectedIntegrations`) because rate parity only requires `query_hotel_data` (registered in the `if (this.serverClient)` block) and `search_google` (always available). It does NOT require any Pipedream integrations.

   b. **Group booking hints** — appended inside the existing `connectedIntegrations` conditional block, AFTER the existing integration routing rules:
      ```
      - Group bookings from email: gmail-find-email → present list via ask_user → gmail-get-email → cache full email via cache_content → parse_group_inquiry → present parsed data via ask_user → generate_group_quote → cache full email draft via cache_content → present quote via ask_user → gmail-send-email with cached draft. Each ask_user must be the only action in its step.
      ```
      This belongs in the `connectedIntegrations` block because it requires Gmail integration actions.

   > **[HAZARD — Prompt ordering]** The group booking hints MUST appear AFTER the integrations manifest so the planner knows what tools it has before seeing workflow recipes that reference those tools. Placing hints before the manifest could cause the planner to attempt integration actions without knowing which are available. Severity: Medium.

   > **[HAZARD — Prompt length budget]** The planner system prompt already includes: role description, security rules, responsibilities (with hotel capabilities), connected integrations (full manifest), task completion validation, formatting rules, and response format. Adding workflow guidance increases prompt length. Keep hints concise — short bullet points, not full prose. Severity: Medium.

4. **Server client convenience methods** (required, in `services/server/serverClient.ts`):
   - `parseGroupInquiry(emailText: string): Promise<ParseGroupInquiryResult>` — wraps `apiClient.post<ParseGroupInquiryResult>('/group-quotes/parse-inquiry', { emailText })`
   - `generateGroupQuote(params: GenerateGroupQuoteRequest): Promise<GenerateGroupQuoteResult>` — wraps `apiClient.post<GenerateGroupQuoteResult>('/group-quotes/generate', params)`

   Both follow the existing direct-unwrap pattern (Pattern 1). The backend wraps responses in `{ success, data }` — matching `ActionRunResult`. The action handlers in builder.ts check `result.success` before accessing `result.data`.

   These are **required**, not optional. Every backend API call in the agent system goes through a `ServerClient` method (e.g., `queryData()`, `runIntegrationAction()`). Direct `apiClient.post()` calls from action handlers would bypass any future middleware (auth refresh, error mapping, retry logic).

5. **Type definitions** (in `services/server/types.ts`):

   These must match the **actual** backend response shapes. Both endpoints wrap responses in `{ success, data }`, matching the existing `ActionRunResult` pattern.

   ```typescript
   // Parse inquiry types — matches backend parse-inquiry.dto.ts
   export interface ParsedInquiryField<T> {
     value: T;
     confidence: 'high' | 'medium' | 'low';
   }

   export interface ParsedContactInfo {
     name?: string | null;
     email?: string | null;
     phone?: string | null;
   }

   export interface ParsedInquiryData {
     checkInDate?: ParsedInquiryField<string | null>;
     checkOutDate?: ParsedInquiryField<string | null>;
     roomCount?: ParsedInquiryField<number | null>;
     contactInfo?: ParsedContactInfo;
   }

   export interface ParseGroupInquiryResult {
     success: boolean;
     data: ParsedInquiryData;
   }

   // Generate quote types — matches backend generate-quote.dto.ts
   export interface GenerateGroupQuoteRequest {
     checkInDate: string;
     checkOutDate: string;
     roomCount: number;
     context?: string;
     guestName?: string;
   }

   export interface GenerateGroupQuoteResult {
     success: boolean;
     data: {
       allocation: Record<string, unknown>;
       metrics: Record<string, unknown>;
       emailDraft: string;
     };
   }
   ```

   > **[HAZARD]** The backend `ParsedInquiryResponse` does NOT include `guestCount`, `eventType`, or `specialRequirements` — the backend DTO comments state "Room preferences, event type, etc. are handled by the allocation AI which reads the raw email directly." The `context` parameter on `generate_group_quote` carries the raw email for that purpose. Severity: Medium.

### Relevant Backend Capabilities (Already Exist)

| Capability | Endpoint/Service | What It Provides |
|---|---|---|
| Search emails | `gmail-find-email` via Pipedream | Gmail query search, returns IDs + snippets |
| Read email | `gmail-get-email` via Pipedream | Full email content by message ID |
| Send email | `gmail-send-email` via Pipedream | Send via user's Gmail |
| Parse inquiry | `POST /group-quotes/parse-inquiry` | AI extracts dates, rooms, guest info |
| Generate quote | `POST /group-quotes/generate` | Full quote: allocation + pricing + email draft |
| Save quote | `POST /group-quotes` | Persist quote to database |
| Regenerate email | `POST /group-quotes/regenerate-template` | Fresh AI-generated email prose |
| Quote settings | `GET/PUT /group-quotes/settings` | Discount tiers, hotel info, email template |
| Hotel context | `GET /ai/extension/context` | Hotel name, room types, capabilities |
| Performance data | `query_hotel_data` → `POST /ai/extension/query` | Occupancy, rates, competitor data |

### Data Flow for Quote Calculation (Detail)

```
fetchDayMetrics(userId, { date, type: Summary }) returns per night:
├── occupancy: number (current OTB %)
├── forecastedOccupancy: number (ML-predicted %)
├── roomTypes: [{
│     name: "King Suite", id: "pms-id-123",
│     rate: 189, availableRooms: 12, bookedRooms: 7, occupancy: 58.3%
│   }]
└── priorYearRoomTypes: [{ name: "King Suite", adr: 172, occupancy: 61% }]

Discount calculation:
├── forecastedOccupancy < 30% → 15% discount
├── forecastedOccupancy < 60% → 10% discount
├── forecastedOccupancy < 80% → 5% discount
└── forecastedOccupancy ≥ 80% → 0% discount
(configurable per user via /group-quotes/settings)

Consecutive availability:
├── For 3-night stay: min(unsold_night1, unsold_night2, unsold_night3) per room type
└── Ensures guest keeps same room type for entire stay

AI room allocation (with context):
├── Input: "Wedding for 25 couples" + available inventory
├── AI understands: couples → king beds, ADA → accessible rooms
└── Falls back to cheapest-first if no context or AI fails
```

### PMS Factory Architecture (Backend — For Future Rate Push)

The backend PMS integration layer at `shared/providers/pms/` uses a factory pattern:

```
PmsFactory(pmsType: PmsType) → PmsProvider interface
├── MewsProvider    (mews.provider.ts)
├── CloudBedsProvider (cloudbeds.provider.ts)
└── ResNexusProvider  (resnexus.provider.ts)
```

**PmsType enum:** `Mews = "MEWS"`, `CloudBeds = "CLOUDBEDS"`, `ResNexus = "RESNEXUS"` (from `user-metadata.entity.ts`)

**Key PmsProvider interface methods for rate pushing:**
- `updateRatePricing(accessToken, rates[{rateId, startDate, endDate, price}])` — per-rate date-range updates
- `updateRates({priceUpdates[{roomId, price, date}], rateId, accessToken, timezone})` — room-level granularity with timezone handling
- `updateRatePricingAllDatesForRate(accessToken, ratesId, priceUpdates[], rateIds?)` — bulk across multiple rates

**Mews implementation specifics:**
- Calls `POST /api/connector/v1/rates/updatePrice` with `ClientToken` + `AccessToken`
- Chunks to 1000 items per API call
- Converts dates to Mews UTC format via `convertToMewsUtc(date, timezone)` using moment-timezone
- Price values are rounded to integers: `Number(update.price.toFixed(0))`

**User PMS entity** (`user-pms.entity.ts`): Stores `userId`, `pms` (PmsType), `accessToken`, `apiKey`, `propertyID`, `shouldPushPrices` flag.

This is backend-internal infrastructure. A future rate push feature would need a new backend API endpoint (e.g., `POST /ai/extension/push-rates`) that authenticates the extension user, looks up their PMS credentials, and delegates to `PmsFactory.getProvider().updateRates()`.

---

## Summary: What's Needed Where

| Component | OTA Price Parity | Group Bookings |
|---|---|---|
| Backend | Nothing | Nothing (all endpoints exist) |
| Pipedream manifest | Nothing | Done (find/get/send added) |
| Extension: new actions | None needed | `parse_group_inquiry`, `generate_group_quote` |
| Extension: action limit | Increase truncation 2000→8000 | Increase truncation 2000→8000 |
| Extension: planner prompt | Scraping + fallback awareness | Gmail routing + multi-step workflow |
| Extension: navigator | Google price scraping (LLM-driven) | Not needed (integration actions) |
| Extension: UI | None (report via done action) | None (quote via ask_user action) |

### Files to Modify

| File | Changes |
|---|---|
| `chrome-extension/src/background/services/server/types.ts` | Add `ParsedInquiryField`, `ParsedContactInfo`, `ParsedInquiryData`, `ParseGroupInquiryResult`, `GenerateGroupQuoteRequest`, `GenerateGroupQuoteResult` interfaces |
| `chrome-extension/src/background/services/server/serverClient.ts` | Add `parseGroupInquiry()` and `generateGroupQuote()` convenience methods |
| `chrome-extension/src/background/agent/actions/schemas.ts` | Add `parseGroupInquiryActionSchema`, `generateGroupQuoteActionSchema` |
| `chrome-extension/src/background/agent/actions/builder.ts` | Import new schemas; register new actions inside `if (this.serverClient)` block after `queryHotelData`; extract truncation limit to `INTEGRATION_RESULT_MAX_LENGTH = 8000` |
| `chrome-extension/src/background/agent/prompts/templates/planner.ts` | Add `serverAvailable`-gated `# WORKFLOW HINTS` section for rate parity (after responsibilities, before integrations); append group booking hints inside the `connectedIntegrations` conditional block (after existing routing rules) |
| `chrome-extension/src/background/agent/prompts/__tests__/planner.test.ts` | Add tests: (1) rate parity hints present when `serverAvailable=true`, (2) rate parity hints NOT present when `serverAvailable=false`, (3) group booking hints present when `connectedIntegrations` is non-empty, (4) group booking hints NOT present when `connectedIntegrations` is absent |
| `chrome-extension/src/background/services/server/__tests__/serverClient.test.ts` | Add tests for `parseGroupInquiry` and `generateGroupQuote` methods |

### Implementation Order

1. **Types** (`types.ts`) — Add request/response interfaces (no dependencies)
2. **ServerClient** (`serverClient.ts`) — Add convenience methods (depends on types)
3. **Schemas** (`schemas.ts`) — Add new action schemas (no dependencies)
4. **Builder** (`builder.ts`) — Import schemas, register actions, update truncation limit (depends on schemas + serverClient)
5. **Planner Prompt** (`planner.ts`) — Add workflow hints (independent)
6. **Tests** — Update planner and serverClient tests (depends on all above)
7. **Verify** — `pnpm -F chrome-extension type-check && pnpm -F chrome-extension test && pnpm build`

### Verification

1. `pnpm -F chrome-extension type-check` — types compile
2. `pnpm -F chrome-extension test` — existing + new tests pass
3. `pnpm build` — full build succeeds
4. Manual test: load extension, connect to backend with hotel context, test both workflows end-to-end
