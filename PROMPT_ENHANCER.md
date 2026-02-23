# Prompt Enhancer Layer

## Context

User prompts go directly to the agent system (Planner → Navigator) without optimization. Vague prompts like "find cheap flights" or "check my email" lead to poor browser automation because the agents lack specificity, context, and clear success criteria. A preprocessing layer that rewrites prompts for browser automation would improve task success rates.

**Current flow**: `User prompt → sanitize/wrap → Planner (classify + plan) → Navigator (execute)`
**Proposed flow**: `User prompt → PromptEnhancer (if source=user) → sanitize/wrap → Planner → Navigator`

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
- Logger module name: `'PromptEnhancer'` (follows PascalCase convention used by agent modules: `'Executor'`, `'PlannerAgent'`, `'NavigatorAgent'`, `'MessageManager'`)

**Imports**:
- `import type { BaseChatModel } from '@langchain/core/language_models/chat_models';`
- `import { SystemMessage, HumanMessage } from '@langchain/core/messages';`
- `import { createLogger } from '@src/background/log';`
- `import { filterExternalContent } from '@src/background/agent/messages/utils';`

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
- If the prompt is too vague to make actionable for browser automation (no clear website, action, or success criteria), return it UNCHANGED — do not invent goals or preferences the user didn't state
- If the prompt requests something outside browser automation capabilities (e.g., filing taxes, accessing local files, tasks requiring personal knowledge), return it UNCHANGED — let downstream agents handle feasibility
- Return ONLY the enhanced prompt text, no explanations or markup
```

**Message construction**: Interpolate `url` and `title` into the system prompt via template literal. The raw task goes in the `HumanMessage` — do not embed it in the system prompt. This matches LLM best practices (system = instructions, human = input):

```typescript
const safeUrl = filterExternalContent(context.url, false);
const safeTitle = filterExternalContent(context.title, false);
const systemContent = `You are a prompt optimizer...
- Incorporate page context when relevant (the user is currently on: ${safeUrl} - ${safeTitle})
...`;

const systemMessage = new SystemMessage(systemContent);
const humanMessage = new HumanMessage(rawTask);
```

`filterExternalContent(value, false)` (from `messages/utils.ts:300`) runs pattern-based sanitization in non-strict mode, stripping prompt injection attempts from the tab URL/title before interpolation. This uses the same guardrails infrastructure as the rest of the agent system without the heavy wrapping of `wrapUntrustedContent` which would confuse the enhancer LLM.

### 2.5. Add `source` field to `new_task` message

**File**: `pages/side-panel/src/SidePanel.tsx`

The `shortcutsMeta` and `quickActionMeta` variables in `handleSendMessage` (line 918) already carry enough information to determine the prompt source. Derive `source` at the `sendMessage` call site (line 998-1003) without changing any signatures or prop types:

```typescript
await sendMessage({
  type: 'new_task',
  task: text,
  taskId: sessionIdRef.current,
  tabId,
  source: shortcutsMeta ? 'shortcut' : quickActionMeta ? 'workflow' : 'user',
});
```

**Type**: `source: 'user' | 'workflow' | 'shortcut'`

Note: Port messages between the side panel and background are untyped (`any`) — no TypeScript interface exists for these message shapes. The `source` field is a runtime-only property read via `message.source` in the background handler. No type definition changes are needed.

This works because:
- **Shortcuts** (ChatInput.tsx:401) always pass `shortcutsMeta` as the 3rd arg to `onSendMessage`
- **Quick Actions** (ChatInput.tsx:417, SidePanel.tsx:1424) always pass `quickActionMeta` as the 4th arg
- **Normal user input** (ChatInput.tsx:464) passes neither

No changes needed to `handleSendMessage` signature, `ChatInputProps`, or any call sites.

### 3. Integrate into `setupExecutor()`

**File**: `chrome-extension/src/background/index.ts`

`setupExecutor` (line 775) has exactly **two call sites** (both in this file):
- Line 472 — `new_task` handler
- Line 540 — `replay` handler

Add import at the top of `chrome-extension/src/background/index.ts`:
```typescript
import { enhancePrompt } from '@src/background/agent/prompt-enhancer';
```

Changes to `setupExecutor`:
- Add `options?: { tabId?: number; enhance?: boolean }` parameter
- Change return type to `Promise<{ executor: Executor; enhancedTask: string }>`

Full updated signature:
```typescript
async function setupExecutor(
  taskId: string,
  task: string,
  browserContext: BrowserContext,
  options?: { tabId?: number; enhance?: boolean },
): Promise<{ executor: Executor; enhancedTask: string }>
```

Insert enhancement block after line 827 (`browserContext.updateConfig`), before line 829 (`let connectedIntegrations`):
```typescript
let enhancedTask = task;
if (options?.enhance && generalSettings.enhancePrompts) {
  try {
    const tab = await chrome.tabs.get(options.tabId!);
    enhancedTask = await enhancePrompt(task, plannerLLM ?? navigatorLLM, {
      url: tab.url ?? '',
      title: tab.title ?? '',
    });
  } catch (error) {
    logger.warning('Prompt enhancement skipped:', error);
  }
}
```

Change the Executor construction (line 852) to use `enhancedTask`:
```typescript
const executor = new Executor(enhancedTask, taskId, browserContext, navigatorLLM, {
```

Change the return (line 866) to return the object:
```typescript
return { executor, enhancedTask };
```
  - **Debugging note**: Once passed to the Executor, the enhanced task replaces the original in all downstream components (Planner prompt, Navigator instructions, execution logs, server-persisted messages). The `prompt_enhanced` notification in the side panel is the only record of what the user originally typed vs. what the agent received. The enhancer should log both the original and enhanced prompts at `info` level (`debug` level is dev-only in this codebase — `log.ts:26` noops in production).
  - **Cost tracking**: this LLM call happens before the Executor is created, so it is NOT tracked by the Executor's cost tracking system (`CostTracker`). The enhancement cost is invisible to the user's "Show Cost Estimate" display. This is acceptable for v1 — the call is a single short prompt/response, so cost is minimal relative to the full task execution.
  - If enhancement is skipped or disabled, `enhancedTask === task`

> **[HAZARD]** `chrome.tabs.get(tabId)` can throw if the tab was closed between Send and enhancement (~1-3s). Severity: Low. Mitigated: the entire enhancement block is wrapped in try/catch (see code above) — on any failure, `enhancedTask` remains equal to `task`.

> **[HAZARD]** Tab title prompt injection: A malicious page can set its `document.title` to adversarial text. Severity: Low. Mitigated: the enhancer sanitizes URL/title via `filterExternalContent(value, false)` before interpolation (see Section 2), and the enhanced prompt still passes through `filterExternalContent` downstream in `MessageManager.taskInstructions()`.

Update **both** call sites:
- `new_task` handler (line 472): `const { executor, enhancedTask } = await setupExecutor(message.taskId, message.task, browserContext, { tabId: message.tabId, enhance: message.source !== 'shortcut' && message.source !== 'workflow' });` then `currentExecutor = executor;` — only user-typed prompts are enhanced; workflows and shortcuts pass through unchanged
- `replay` handler (line 540): `const { executor } = await setupExecutor(message.taskId, message.task, browserContext);` then `currentExecutor = executor;` — replay tasks pass no options, so `enhance` defaults to falsy

> **[HAZARD]** The `prompt_enhanced` notification (Section 4) must be sent from the `new_task` handler AFTER `setupExecutor` returns but BEFORE `currentExecutor.execute()`. Ensure this happens between `setupExecutor` and `subscribeToExecutorEvents`, not after `execute()` completes. Severity: Medium — wrong placement means the user sees the notification after the task finishes instead of before it starts.

> **[HAZARD]** Race condition: Between the start of `enhancePrompt()` and the assignment to `currentExecutor`, any `cancel_task` / `pause_task` messages target the old executor (or null). The window is proportional to the LLM round-trip (~1-3 s). Severity: Low. Mitigation: acceptable for now — the user is unlikely to cancel within seconds of submitting. If this becomes an issue, set a `pendingSetup` flag that makes cancel wait.
>
> Additionally, the enhancement LLM call has no `AbortSignal` — if the user cancels during enhancement, the call runs to completion silently. The cost is one wasted LLM round-trip. To add cancellation support later, pass `controller.signal` from a module-level `AbortController` that `cancel_task` can abort.

**UX timing note**: With enhancement enabled, there is a ~1-3 s delay between the user pressing Send and the `TASK_START` event (which triggers the activity indicator in the side panel). During this window the user sees no feedback. The `prompt_enhanced` notification (Section 4) partially addresses this — it arrives just before `TASK_START`. For v1 this is acceptable. If user feedback indicates the delay feels broken, a `prompt_enhancing` message could be sent before the LLM call begins.

### 4. Side panel notification

**File**: `chrome-extension/src/background/index.ts` (new_task handler)

After `setupExecutor` returns but before `subscribeToExecutorEvents`, if task was enhanced (`enhancedTask !== message.task`):
```
currentPort?.postMessage({ type: 'prompt_enhanced', enhanced: enhancedTask, taskId: message.taskId });
```
`currentPort` is always non-null here — it's assigned at line 439 before the message listener fires.

Skip the notification if `enhancedTask === message.task` — this means the enhancer returned the prompt unchanged (either because it was already clear, too short to enhance, or the setting is off). The notification should only appear when actual enhancement occurred.

**File**: `pages/side-panel/src/SidePanel.tsx` (port message listener at line 575)

Add handler as another `else if` branch at line 748 (after `heartbeat_ack`, before the closing `});`), matching the existing pattern for non-AgentEvent messages (same pattern as `voice_result`, `voice_error`, `heartbeat_ack`, etc.):

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
- `appendMessage` is defined at line 274 with signature `(newMessage: Message, sessionId?: string | null)`
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
- **New tasks only, not follow-ups** — follow-ups use `addFollowUpTask()` (line 490 in the `follow_up_task` handler) which never calls `setupExecutor`. They carry conversational context that enhancement could corrupt
- **Replay tasks skip enhancement** — replays replay recorded actions verbatim via `replayHistory()`
- **User-typed prompts only** — workflows (Quick Actions) are already detailed multi-step instructions authored by the developer; enhancing them would likely degrade quality. Shortcuts are user-defined prompt templates that should execute as-written. Only freeform user-typed text benefits from enhancement.
- **Source derived from existing parameters** — the `shortcutsMeta` and `quickActionMeta` variables in `handleSendMessage` already distinguish prompt sources. Deriving `source` at the `sendMessage` call avoids changing function signatures and prop types across multiple files. The derived `source` field on `new_task` is still explicit and future-proof for the background consumer (e.g., a future `'voice'` source could be added independently).
- **No feasibility gatekeeping** — the enhancer passes through infeasible or extremely vague prompts (e.g., "file my taxes", "find my favorite song") unchanged rather than rejecting or attempting to rescue them. The Planner already classifies tasks (`GENERAL` / `BROWSER` / `DOMAIN_QUERY`) and can answer directly, ask for clarification via `ask_user`, or explain it can't help. Duplicating that logic in the enhancer would violate single responsibility.
- **Graceful fallback** — any error returns original prompt, zero risk to existing flow
- **Security preserved** — enhanced prompt still passes through `filterExternalContent` sanitization in `MessageManager.taskInstructions()` (messages/service.ts:146)
- **Non-AgentEvent notification** — `prompt_enhanced` is sent as a plain port message (not through the executor event system), matching the existing pattern for non-execution notifications (voice_result, voice_error, heartbeat_ack, etc.)
- **Two `Actors` enums exist** — `packages/storage/lib/chat/types.ts` (6 members, includes VALIDATOR) and `chrome-extension/src/background/agent/event/types.ts` (5 members, no VALIDATOR). The side panel imports from `@extension/storage`. The background agent code uses the event/types version. The prompt enhancer (running in background) should NOT need either — it's a pure function that takes/returns strings.

## Files to Modify

| File | Change |
|------|--------|
| `chrome-extension/src/background/agent/prompt-enhancer.ts` | **New** — `enhancePrompt()` function |
| `chrome-extension/src/background/index.ts` | Wire enhancer into `setupExecutor()` + both call sites + `prompt_enhanced` notification |
| `packages/storage/lib/settings/generalSettings.ts` | Add `enhancePrompts` to interface + defaults |
| `pages/options/src/components/GeneralSettings.tsx` | Add UI toggle after "Show Cost Estimate" (line 189) |
| `pages/side-panel/src/SidePanel.tsx` | Add `source` field to `new_task` sendMessage call (line 998), handle `prompt_enhanced` port message (line 748) |

## Verification

1. `pnpm -F chrome-extension type-check` — ensure no TS errors in background/agent changes
2. `pnpm -F @extension/sidepanel type-check` — side panel changes compile (note: the filter is `@extension/sidepanel`, not `pages/side-panel`)
3. `pnpm -F @extension/options type-check` — options page changes compile (note: the filter is `@extension/options`, not `pages/options`)
4. `pnpm -F @extension/storage type-check` — storage changes compile (note: the filter is `@extension/storage`, not `packages/storage`)
5. `pnpm build` — full build succeeds
6. Create `chrome-extension/src/background/agent/__tests__/prompt-enhancer.test.ts` — test cases:
   - Returns original for prompts under 10 chars
   - Returns enhanced text when LLM returns string content
   - Handles `ContentPart[]` response format correctly
   - Returns original on LLM error (graceful fallback)
   - Sanitizes URL/title via `filterExternalContent`
   - Run: `pnpm -F chrome-extension test -- -t "PromptEnhancer"`
7. Manual test: load extension, send a vague prompt like "find flights", verify enhanced prompt appears in side panel as system message before planner runs
8. Manual test: toggle setting off in options, verify prompts pass through unchanged
9. Manual test: send very short prompt "hi", verify it skips enhancement
10. Manual test: click a workflow Quick Action (e.g., OTA Parity), verify the prompt is NOT enhanced (passes through unchanged)
11. Manual test: type a `/shortcut` command, verify the expanded prompt is NOT enhanced
