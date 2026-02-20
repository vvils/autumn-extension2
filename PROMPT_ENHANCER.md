# Prompt Enhancer Layer

## Context

User prompts go directly to the agent system (Planner → Navigator) without optimization. Vague prompts like "find cheap flights" or "check my email" lead to poor browser automation because the agents lack specificity, context, and clear success criteria. A preprocessing layer that rewrites prompts for browser automation would improve task success rates.

**Current flow**: `User prompt → sanitize/wrap → Planner (classify + plan) → Navigator (execute)`
**Proposed flow**: `User prompt → PromptEnhancer (optimize) → sanitize/wrap → Planner → Navigator`

## Implementation

### 1. Add `enhancePrompts` setting

**File**: `packages/storage/lib/settings/generalSettings.ts`

- Add `enhancePrompts: boolean` to `GeneralSettingsConfig` interface
- Add `enhancePrompts: true` to `DEFAULT_GENERAL_SETTINGS`

Note: The `getSettings()` method (line 56) already spreads `DEFAULT_GENERAL_SETTINGS` under stored values, so existing users without this field in storage automatically get the default. No migration needed.

### 2. Create the enhancer function

**New file**: `chrome-extension/src/background/agent/prompt-enhancer.ts`

Single exported function `enhancePrompt(rawTask, llm, context)`:

- **Input**: raw task string, planner's `BaseChatModel`, `{ url, title }` of current tab
- **Output**: enhanced task string (or original on failure)
- **Skip condition**: prompts under 10 chars (greetings like "hi", "hello")
- **Fallback**: any error returns original prompt unchanged via try/catch
- Uses `SystemMessage` + `HumanMessage` from `@langchain/core/messages`
- Uses `createLogger` from `@src/background/log` (same pattern as all agent modules)

**LLM invocation pattern** (new — no existing precedent in the codebase):

```typescript
const response = await llm.invoke([systemMessage, humanMessage]);
const content = response.content;
// content may be string or ContentPart[] — extract text:
const enhanced = typeof content === 'string'
  ? content
  : content.map(part => ('text' in part ? part.text : '')).join('');
return enhanced.trim() || rawTask;
```

`BaseChatModel.invoke()` returns `BaseMessageChunk` whose `.content` is typed as `string | ContentPart[]`. Most providers return `string`, but the array form must be handled to avoid runtime crashes with providers that use multi-part responses (e.g., Anthropic with thinking enabled).

**System prompt sketch** (the implementer should refine this):

```
You are a prompt optimizer for a browser automation agent. Your job is to rewrite vague user prompts into specific, actionable instructions for an AI that controls a web browser.

Rules:
- If the prompt is already clear and specific (contains URLs, step-by-step instructions, or detailed criteria), return it UNCHANGED
- Add specificity: "find flights" → "Search Google Flights for the cheapest round-trip flights"
- Incorporate page context when relevant (the user is currently on: {url} - {title})
- Structure multi-step requests with numbered steps
- Preserve the user's original intent exactly — do not add goals they didn't express
- Return ONLY the enhanced prompt text, no explanations or markup
```

### 3. Integrate into `setupExecutor()`

**File**: `chrome-extension/src/background/index.ts`

`setupExecutor` has exactly **two call sites** (both in this file):
- Line 368 — `new_task` handler
- Line 458 — `replay` handler

Changes to `setupExecutor`:
- Add `options?: { tabId?: number; skipEnhancement?: boolean }` parameter
- Change return type to `Promise<{ executor: Executor; enhancedTask: string }>`
- After `generalSettings` is loaded (line 741) and `plannerLLM` created (line 724), before `new Executor(...)` (line 770):
  - If `generalSettings.enhancePrompts && !options?.skipEnhancement`, get tab URL/title via `chrome.tabs.get(options.tabId)` (safe — `chrome.tabs.get()` is used throughout the service worker)
  - Call `enhancePrompt(task, plannerLLM ?? navigatorLLM, { url, title })`
  - Pass enhanced task to `new Executor(enhancedTask, ...)`
  - Extract text from the LLM response safely — `response.content` may be `string` or `ContentPart[]` (see Section 2)
  - **Cost tracking**: this LLM call happens before the Executor is created, so it is NOT tracked by the Executor's cost tracking system (`CostTracker`). The enhancement cost is invisible to the user's "Show Cost Estimate" display. This is acceptable for v1 — the call is a single short prompt/response, so cost is minimal relative to the full task execution.
  - If enhancement is skipped or disabled, `enhancedTask === task`

Update **both** call sites:
- `new_task` handler (line 368): `const { executor, enhancedTask } = await setupExecutor(message.taskId, message.task, browserContext, { tabId: message.tabId });`
- `replay` handler (line 458): `const { executor } = await setupExecutor(message.taskId, message.task, browserContext, { tabId: message.tabId, skipEnhancement: true });` — replay tasks replay recorded actions verbatim and must NOT be enhanced

> **[HAZARD]** Race condition: Between the start of `enhancePrompt()` and the assignment to `currentExecutor`, any `cancel_task` / `pause_task` messages target the old executor (or null). The window is proportional to the LLM round-trip (~1-3 s). Severity: Low. Mitigation: acceptable for now — the user is unlikely to cancel within seconds of submitting. If this becomes an issue, set a `pendingSetup` flag that makes cancel wait.
>
> Additionally, the enhancement LLM call has no `AbortSignal` — if the user cancels during enhancement, the call runs to completion silently. The cost is one wasted LLM round-trip. To add cancellation support later, pass `controller.signal` from a module-level `AbortController` that `cancel_task` can abort.

**UX timing note**: With enhancement enabled, there is a ~1-3 s delay between the user pressing Send and the `TASK_START` event (which triggers the activity indicator in the side panel). During this window the user sees no feedback. The `prompt_enhanced` notification (Section 4) partially addresses this — it arrives just before `TASK_START`. For v1 this is acceptable. If user feedback indicates the delay feels broken, a `prompt_enhancing` message could be sent before the LLM call begins.

### 4. Side panel notification

**File**: `chrome-extension/src/background/index.ts` (new_task handler)

After `setupExecutor` returns, if task was enhanced (`enhancedTask !== message.task`):
```
currentPort?.postMessage({ type: 'prompt_enhanced', enhanced: enhancedTask, taskId: message.taskId });
```
`currentPort` is always non-null here — it's assigned at line 335 before the message listener fires.

**File**: `pages/side-panel/src/SidePanel.tsx` (port message listener at line 556)

Add handler as another `else if` branch at ~line 707 (before the closing `}`), matching the existing pattern for non-AgentEvent messages (same pattern as `voice_result`, `voice_error`, `heartbeat_ack`, etc.):

```typescript
} else if (message && message.type === 'prompt_enhanced') {
  appendMessage({
    actor: Actors.SYSTEM,
    content: `Enhanced: ${message.enhanced}`,
    timestamp: Date.now(),
  });
}
```

- `Actors` is imported from `@extension/storage` (the side panel uses the storage enum, not the event/types one — note: two separate `Actors` enums exist, see `packages/storage/lib/chat/types.ts` vs `chrome-extension/src/background/agent/event/types.ts`)
- `appendMessage` is defined at line 250 with signature `(newMessage: Message, sessionId?: string | null)`
- `Message` interface (from `packages/storage/lib/chat/types.ts:10`) requires `{ actor: Actors, content: string, timestamp: number }`
- **Note**: `appendMessage` also persists the message to the server conversation history (via `add_message` port message) when a `sessionId` is active. This means "Enhanced: ..." will appear in saved conversations. This is acceptable — it provides an audit trail of what the agent actually received.

### 5. Options page toggle

**File**: `pages/options/src/components/GeneralSettings.tsx`

Add toggle following the exact pattern of "Enable Vision" (lines 91-108) and "Show Cost Estimate" (lines 172-189):

```tsx
<div className="flex items-center justify-between">
  <div>
    <h3 className={labelClass}>{'Enhance Prompts'}</h3>
    <p className={descClass}>{'Optimize prompts for browser automation (adds one LLM call per task)'}</p>
  </div>
  <div className="relative inline-flex cursor-pointer items-center">
    <input
      id="enhancePrompts"
      type="checkbox"
      checked={settings.enhancePrompts}
      onChange={e => updateSetting('enhancePrompts', e.target.checked)}
      className="peer sr-only"
    />
    <label htmlFor="enhancePrompts" className={toggleClass}>
      <span className="sr-only">{'Enhance Prompts'}</span>
    </label>
  </div>
</div>
```

Place after the "Show Cost Estimate" toggle (line 189) — keeps enhancement near other task-behavior settings, before "Replay Historical Tasks" which is the final toggle.

## Design Decisions

- **Separate function, not a class** — KISS, single responsibility
- **Intercept in `setupExecutor`** — before Executor construction, so downstream code (Executor, MessageManager, Planner, Navigator) is untouched
- **Reuse planner LLM** — no extra model configuration needed
- **New tasks only, not follow-ups** — follow-ups use `addFollowUpTask()` (line 386) which never calls `setupExecutor`. They carry conversational context that enhancement could corrupt
- **Replay tasks skip enhancement** — replays replay recorded actions verbatim via `replayHistory()`
- **Graceful fallback** — any error returns original prompt, zero risk to existing flow
- **Security preserved** — enhanced prompt still passes through `filterExternalContent` sanitization in `MessageManager.taskInstructions()` (messages/service.ts:146)
- **Non-AgentEvent notification** — `prompt_enhanced` is sent as a plain port message (not through the executor event system), matching the existing pattern for non-execution notifications (voice_result, voice_error, heartbeat_ack, etc.)
- **Two `Actors` enums exist** — `packages/storage/lib/chat/types.ts` (6 members, includes VALIDATOR) and `chrome-extension/src/background/agent/event/types.ts` (5 members, no VALIDATOR). The side panel imports from `@extension/storage`. The background agent code uses the event/types version. The prompt enhancer (running in background) should NOT need either — it's a pure function that takes/returns strings.

## Files to Modify

| File | Change |
|------|--------|
| `chrome-extension/src/background/agent/prompt-enhancer.ts` | **New** — `enhancePrompt()` function |
| `chrome-extension/src/background/index.ts` | Wire enhancer into `setupExecutor()` + both call sites (new_task line 368, replay line 458) + prompt_enhanced notification |
| `packages/storage/lib/settings/generalSettings.ts` | Add `enhancePrompts` to interface + defaults |
| `pages/options/src/components/GeneralSettings.tsx` | Add UI toggle after "Show Cost Estimate" |
| `pages/side-panel/src/SidePanel.tsx` | Handle `prompt_enhanced` port message (~line 707) |

## Verification

1. `pnpm -F chrome-extension type-check` — ensure no TS errors in background/agent changes
2. `pnpm -F @extension/sidepanel type-check` — side panel changes compile (note: the filter is `@extension/sidepanel`, not `pages/side-panel`)
3. `pnpm -F @extension/options type-check` — options page changes compile (note: the filter is `@extension/options`, not `pages/options`)
4. `pnpm -F @extension/storage type-check` — storage changes compile (note: the filter is `@extension/storage`, not `packages/storage`)
5. `pnpm build` — full build succeeds
6. Manual test: load extension, send a vague prompt like "find flights", verify enhanced prompt appears in side panel as system message before planner runs
7. Manual test: toggle setting off in options, verify prompts pass through unchanged
8. Manual test: send very short prompt "hi", verify it skips enhancement
9. Manual test: click a workflow Quick Action (e.g., OTA Parity), verify the detailed prompt passes through mostly unchanged
