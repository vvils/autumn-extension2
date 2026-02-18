# Implementation Plan: `ask_user` Navigator Action

## Context

The navigator agent currently runs autonomously and cannot pause to ask the user for input mid-task. This means tasks requiring user confirmation, decisions between options, or clarification must either be planned upfront or fail. Adding an `ask_user` action lets the navigator pause execution, present a question with optional structured context and choices in the side panel, wait for the user's response, and resume with that response in the agent's context.

## Files to Modify (in order)

### 1. `chrome-extension/src/background/agent/types.ts` — Add user input waiting to AgentContext

Add a resolver field and two methods to the `AgentContext` class after `costTracker` (line 53). Note: all existing AgentContext members are public (no access modifiers), so keep this consistent.

**Field declaration** (line 54, after `costTracker: CostTracker;`): Declare the field _without_ a field initializer, matching the existing pattern where all fields are plain type annotations at the class level:

```typescript
userInputResolve: ((value: string) => void) | null;

waitForUserInput(): Promise<string> {
  // Reject previous pending promise if re-entered (prevents orphaned promises)
  if (this.userInputResolve) {
    this.userInputResolve('');
    this.userInputResolve = null;
  }

  return new Promise((resolve, reject) => {
    this.userInputResolve = resolve;
    const onAbort = () => {
      this.userInputResolve = null;
      reject(new Error('Task cancelled while waiting for user input'));
    };
    if (this.controller.signal.aborted) {
      onAbort();
      return;
    }
    this.controller.signal.addEventListener('abort', onAbort, { once: true });
  });
}

resolveUserInput(value: string): void {
  this.userInputResolve?.(value);
  this.userInputResolve = null;
}
```

**Constructor initialization** (line 79, after `this.costTracker = new CostTracker();`): Add `this.userInputResolve = null;` to match the existing pattern where every field is explicitly initialized in the constructor body.

> **[HAZARD]** Re-entrancy: If the LLM emits two `ask_user` actions in one step, the second `waitForUserInput()` call would overwrite `userInputResolve`, orphaning the first promise forever (memory leak). The guard above resolves the previous promise with empty string before creating a new one. The prompt rule (step 11) also instructs the LLM to use `ask_user` as the only action in a step. Severity: Medium.

### 2. `chrome-extension/src/background/agent/actions/schemas.ts` — Add `askUserActionSchema`

Add at the end of the file. Follows the same `ActionSchema` pattern as existing schemas (`schemas.ts:3-7`). The `ask_user` schema intentionally omits the `intent` field since `question` serves that purpose (consistent with `done` and `query_hotel_data` which also omit `intent`).

```typescript
export const askUserActionSchema: ActionSchema = {
  name: 'ask_user',
  description:
    'Pause and ask the user a question when you need their input, confirmation, or a decision before proceeding. Include context to help them decide.',
  schema: z.object({
    question: z.string().describe('Clear, concise question for the user'),
    context: z
      .string()
      .optional()
      .describe(
        'Markdown-formatted supporting data (lists, summaries, comparisons) to help the user decide',
      ),
    options: z
      .array(
        z.object({
          label: z.string().describe('Button label'),
          value: z.string().describe('Value returned if selected'),
        }),
      )
      .min(2)
      .optional()
      .describe(
        'Array of {label, value} objects as predefined choices (min 2). Omit for free-text only.',
      ),
  }),
};
```

> **[NOTE]** The `Action.prompt()` method (`builder.ts:84-96`) only exposes top-level field descriptions to the LLM — it does not recurse into nested object schemas. The `options` describe text must include the `{label, value}` structure so the LLM knows the expected format. Without this, the LLM would not know the options shape. Severity: High.

### 3. `chrome-extension/src/background/agent/actions/builder.ts` — Add `ask_user` action handler

Add `askUserActionSchema` to the import block from `./schemas` (line 25, alongside the other schema imports).

Add the action inside `buildDefaultActions()`, after the `wait` action (line 231) and before the Element Interaction Actions comment (line 233). Follows the same pattern as other actions: emit `ACT_START`, do work, emit `ACT_OK`, return `ActionResult`.

Existing actions call `emitEvent` without `await` (fire-and-forget). However, for `ask_user` we must `await` the `WIDGET_EVENT` emission to ensure the widget arrives at the side panel _before_ we block on `waitForUserInput()`. The `emitEvent` method (`types.ts:81-89`) is `async` and calls `await this.eventManager.emit(event)`, so awaiting ensures the event callback (which posts to the port) completes before we block.

Note: The first `emitEvent` call (`ACT_START`) is intentionally fire-and-forget (no `await`) to match every other action in the file. Only the `WIDGET_EVENT` emission is awaited.

```typescript
const askUser = new Action(async (input) => {
  this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, 'Asking user for input');

  const widgetData = {
    widgetId: crypto.randomUUID(),
    type: 'permission-request',
    data: {
      question: input.question,
      context: input.context,
      options: input.options,
    },
  };
  await this.context.emitEvent(
    Actors.NAVIGATOR,
    ExecutionState.WIDGET_EVENT,
    JSON.stringify(widgetData),
  );

  const userResponse = await this.context.waitForUserInput();

  this.context.emitEvent(
    Actors.NAVIGATOR,
    ExecutionState.ACT_OK,
    `User responded: ${userResponse}`,
  );
  return new ActionResult({
    extractedContent: `User responded: ${userResponse}`,
    includeInMemory: true,
  });
}, askUserActionSchema);
actions.push(askUser);
```

**Abort error propagation**: If the task is cancelled while `waitForUserInput()` is blocking, the promise rejects with `Error('Task cancelled while waiting for user input')`. This error propagates to `doMultiAction`'s catch block (`navigator.ts:444`), which emits `ACT_FAIL`, increments `errCount`, and pushes an error `ActionResult`. It does NOT re-throw (unless `errCount > 3`, which won't happen for a single cancellation). After `doMultiAction` returns, `execute()` checks `this.context.stopped` (line 222) and exits cleanly. The sequence is: `ACT_START` → `WIDGET_EVENT` → (cancel) → `ACT_FAIL` → `STEP_CANCEL` → `TASK_CANCEL`. This is correct behavior.

> **[HAZARD]** The `doMultiAction` loop in `navigator.ts:378-460` adds a 1-second delay after each action (line 443) and checks `paused/stopped` status (lines 394, 438). During `ask_user`, `actionInstance.call()` blocks on `waitForUserInput()`, so the loop is suspended. If the LLM emits `ask_user` alongside other actions, subsequent actions execute after the user responds — potentially on a stale page state. The prompt rule in step 11 mitigates this by instructing the LLM to use `ask_user` as the sole action, but there is no code-level enforcement. Severity: Low (prompt-level constraint is standard; `done` relies on the same pattern).

### 4. `chrome-extension/src/background/agent/executor.ts` — Expose `resolveUserInput`

Add public method to the `Executor` class (after `pause()` at line 454). This is necessary because `context` is `private readonly` (line 44) and the background service worker cannot access it directly.

```typescript
resolveUserInput(response: string): void {
  this.context.resolveUserInput(response);
}
```

### 5. `chrome-extension/src/background/index.ts` — Handle `permission_response` port message

Add new case in the port message switch (before the `default` case at line 570). Follows the same null-guard pattern as `cancel_task` (line 357-360).

```typescript
case 'permission_response': {
  if (currentExecutor && typeof message.response === 'string') {
    currentExecutor.resolveUserInput(message.response);
  }
  break;
}
```

> **[NOTE]** Added `typeof message.response === 'string'` guard to prevent passing `undefined` to `resolveUserInput` if the message is malformed. Port messages are untyped (`any`), so this is defensive.

### 6. `pages/side-panel/src/components/widgets/types.ts` — Add PermissionWidgetData

Add the new interface and update the union type. Also add `WidgetRespondFn` alongside the existing `WidgetApplyFn` (line 42).

Note on widget type naming: Existing widget types use a `data-` prefix (`data-hotel-metrics-data`, `data-suggestion-action`) because they originate from the domain query system. The `permission-request` type intentionally breaks this convention to distinguish agent-system widgets from domain-data widgets. If a consistent prefix is preferred, use `agent-permission-request` instead and update all references in steps 3, 7, 8, 10A, and 10D.

```typescript
export interface PermissionWidgetData {
  widgetId: string;
  type: 'permission-request';
  data: {
    question: string;
    context?: string;
    options?: Array<{ label: string; value: string }>;
    answered?: boolean;
    response?: string;
  };
}

export type WidgetPayload =
  | HotelMetricsWidgetData
  | SuggestionActionWidgetData
  | PermissionWidgetData;

export type WidgetRespondFn = (widgetId: string, response: string) => void;
```

### 7. `pages/side-panel/src/components/widgets/PermissionWidget.tsx` — New file

Create the permission widget component. Follow the patterns established by `SuggestionActionWidget.tsx`: use `memo`, `useState`, `useCallback`, Tailwind CSS, lucide-react icons.

Component structure:
- **Props**: `{ widget: PermissionWidgetData; onRespond?: WidgetRespondFn }`
- **State**: `status: 'pending' | 'answered'` — derive from `widget.data.answered` for initial state (supports historical load)
- **Layout**:
  1. Question text in bold (`text-[13px] font-medium`)
  2. Context rendered via `MarkdownContent` (imported from `../MarkdownContent`) if `widget.data.context` is provided
  3. Option buttons in a flex row if `widget.data.options` is provided — each button calls `onRespond(widgetId, option.value)` and transitions to `answered`
  4. Free-text textarea with a submit button (always available) — on submit, calls `onRespond(widgetId, textValue)` and transitions to `answered`
  5. When `answered`: show the response text, disable all buttons/inputs, display a check indicator

Note: `MarkdownContent` (`pages/side-panel/src/components/MarkdownContent.tsx`) only allows `['p', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'a', 'br']` — no tables. The schema description for `context` should reference "lists, summaries, comparisons" (not tables) so the LLM uses supported markdown elements.

> **[HAZARD]** Historical unanswered widgets: If a task is cancelled while `ask_user` is pending, no `navigator_widget_response` message is persisted. On historical load, the widget's `data.answered` is falsy, so the component initializes in `pending` state with interactive controls (buttons and textarea remain enabled). Clicking a button in a historical session calls `handlePermissionResponse` → sends port message → background handler checks `if (currentExecutor)` which is likely `null` (no active task) and drops it — no side effects. The UI still transitions to "answered" state locally (state update in `setMessages`), and a `navigator_widget_response` message is persisted so subsequent loads show it as answered. This is consistent with `SuggestionActionWidget` (`widgets/SuggestionActionWidget.tsx`) which also remains fully interactive in historical sessions (Apply/Dismiss buttons work). Severity: Low.

### 8. `pages/side-panel/src/components/widgets/WidgetRenderer.tsx` — Add permission-request case

Update imports and props, add new case to the switch:

```typescript
import type { WidgetPayload, WidgetApplyFn, WidgetRespondFn } from './types';
import PermissionWidget from './PermissionWidget';

interface WidgetRendererProps {
  widget: WidgetPayload;
  onApply?: WidgetApplyFn;
  onRespond?: WidgetRespondFn;
}

// Add case in switch (TypeScript narrows `widget` to `PermissionWidgetData` via the discriminated union on `type`):
case 'permission-request':
  return <PermissionWidget widget={widget} onRespond={onRespond} />;
```

### 9. `pages/side-panel/src/components/MessageList.tsx` — Pass `onRespond` through

Add `onWidgetRespond` prop to both `MessageListProps` and `MessageBlockProps`, pass to `WidgetRenderer`:

```typescript
import type { WidgetPayload, WidgetApplyFn, WidgetRespondFn } from './widgets/types';

interface MessageListProps {
  messages: Message[];
  isStreaming?: boolean;
  onWidgetApply?: WidgetApplyFn;
  onWidgetRespond?: WidgetRespondFn;
}

// In MessageBlock, also add to MessageBlockProps and destructure it.

// Update WidgetRenderer call (line 68):
<WidgetRenderer key={w.widgetId} widget={w as WidgetPayload} onApply={onWidgetApply} onRespond={onWidgetRespond} />
```

### 10. `pages/side-panel/src/SidePanel.tsx` — Wire NAVIGATOR WIDGET_EVENT + `handlePermissionResponse`

**A) Add NAVIGATOR WIDGET_EVENT handler** in `handleTaskState` (line 341), under the `Actors.NAVIGATOR` switch (line 449), add before the `default` case (which logs "Invalid action"):

```typescript
case ExecutionState.WIDGET_EVENT: {
  try {
    const widgetData = JSON.parse(content || '{}');
    if (!widgetData.widgetId || !widgetData.type) return;
    setMessages(prev => [
      ...prev,
      { actor: Actors.SYSTEM, content: '', timestamp, widgets: [widgetData] },
    ]);
    persistMessage({ actor: 'navigator_widget', content: content || '', timestamp });
  } catch (err) {
    console.error('Failed to parse navigator widget event:', err);
  }
  return;
}
```

The message uses `actor: Actors.SYSTEM` with `content: ''` (empty). In `MessageBlock` (`MessageList.tsx:38-77`), `ACTOR_PROFILES` maps `system` → `{ name: 'System' }` (`types/message.ts:7-11`), so a "SYSTEM" label appears above the widget. The empty `content` passed to `MarkdownContent` renders no DOM elements. The `widgets` array renders below via `WidgetRenderer`. Visual result: "SYSTEM" label → PermissionWidget.

Note: The handler ends with `return;` (not `break;`) to exit `handleTaskState` entirely, preventing the `skip` check and `appendMessage` call at lines 551-557. This matches the pattern used by the SYNTHESIZER `WIDGET_EVENT` handler (line 526) and all `STEP_STREAMING` handlers.

We persist with `actor: 'navigator_widget'` (not `'widget'`) to distinguish from synthesizer widgets during historical session loading. Navigator widgets are standalone messages (`actor: Actors.SYSTEM`) rather than being merged into the nearest synthesizer message. The existing `mergeWidgetIntoMessages` utility (`packages/storage/lib/chat/mergeWidget.ts`) merges into `Actors.SYNTHESIZER` messages and must NOT be used here.

> **[HAZARD]** Historical session loading (`SidePanel.tsx` lines 608-641) currently merges ALL `role === 'widget'` messages into the nearest `Actors.SYNTHESIZER` message. Using `actor: 'navigator_widget'` avoids this code path entirely. The historical loading code (step 10D below) must handle this new role. Severity: High.

**B) Add `handlePermissionResponse` callback** (after `handleWidgetApply` around line 216).

Note: Unlike `handleWidgetApply` (which uses a promise-based callback pattern with UUID matching for a request/response round-trip), `handlePermissionResponse` is fire-and-forget from the UI's perspective. The background resolves the agent's promise directly — no response flows back to the UI.

```typescript
const handlePermissionResponse = useCallback((widgetId: string, response: string) => {
  portRef.current?.postMessage({ type: 'permission_response', widgetId, response });
  setMessages(prev =>
    prev.map(msg => ({
      ...msg,
      widgets: msg.widgets?.map(w =>
        w.widgetId === widgetId
          ? { ...w, data: { ...w.data, answered: true, response } }
          : w,
      ),
    })),
  );
  // Persist the answered state so historical loads show the response
  persistMessage({ actor: 'navigator_widget_response', content: JSON.stringify({ widgetId, response }), timestamp: Date.now() });
}, [persistMessage]);
```

Note: The `setMessages` call maps over ALL messages in state, not just the one containing the target widget. This is O(n) over all messages but correct — the alternative (walking backwards to find the specific message, as done in `mergeWidgetIntoMessages`) would be more efficient but requires more complex immutable update logic. Since permission requests are infrequent (at most a few per task), the full scan is acceptable.

**C) Pass to MessageList** (line 1232-1236):

```tsx
<MessageList
  messages={messages}
  isStreaming={isStreamingPlanner || isStreamingSynthesizer}
  onWidgetApply={handleWidgetApply}
  onWidgetRespond={handlePermissionResponse}
/>
```

**D) Update historical session loading** (lines 608-641 inside `setupConnection`). In the `conversation_messages_result` handler, add handling for `navigator_widget` and `navigator_widget_response` roles. These must be inserted between the existing `if (m.role === 'widget')` block (line 609) and the final `else` block (line 634).

**Ordering assumption**: The `navigator_widget_response` handler walks backwards through `mapped` to find the matching widget by `widgetId`. This requires the `navigator_widget` message to appear BEFORE its `navigator_widget_response` in the server's response array. This is guaranteed because: (1) the widget is persisted in the `WIDGET_EVENT` handler (before the user responds), (2) the response is persisted in `handlePermissionResponse` (after the user clicks), and (3) the server returns messages in `createdAt` order.

```typescript
// After the existing `if (m.role === 'widget')` block, add:
} else if (m.role === 'navigator_widget') {
  try {
    const widgetData = JSON.parse(m.content);
    mapped.push({
      actor: Actors.SYSTEM,
      content: '',
      timestamp: new Date(m.createdAt).getTime(),
      widgets: [widgetData],
    });
  } catch {
    /* ignore malformed widget data */
  }
} else if (m.role === 'navigator_widget_response') {
  try {
    const { widgetId, response } = JSON.parse(m.content);
    // Walk backwards and mark the matching widget as answered
    for (let i = mapped.length - 1; i >= 0; i--) {
      const widgets = mapped[i].widgets;
      if (widgets?.some(w => w.widgetId === widgetId)) {
        mapped[i] = {
          ...mapped[i],
          widgets: widgets.map(w =>
            w.widgetId === widgetId
              ? { ...w, data: { ...w.data, answered: true, response } }
              : w,
          ),
        };
        break;
      }
    }
  } catch {
    /* ignore malformed response data */
  }
} else {
```

### 11. `chrome-extension/src/background/agent/prompts/templates/navigator.ts` — Add `ask_user` guidance

Add rule 13 after rule 12 (Plan), before the closing `</system_instructions>` tag (line 131):

```
13. User Input:

- ask_user: Use when you need user input before proceeding. Include context with supporting data (formatted as markdown lists). Provide options as an array of {label, value} objects when choices are finite. Good for: confirming before making changes, choosing between strategies, approving drafts. Do NOT use for trivial confirmations.
- ask_user should always be the only action in a step — do NOT combine it with other actions.
```

## Dependency Notes

- `handlePermissionResponse` is a standalone `useCallback` with dependency `[persistMessage]`. It is NOT called from `handleTaskState` — it flows through props to `MessageList` → `WidgetRenderer` → `PermissionWidget`. Therefore it does NOT need to be added to `handleTaskState`'s dependency array (line 559) or `setupConnection`'s (line 711).
- `handlePermissionResponse` does NOT need to be added to the `setupConnection` dependency array because it's not used inside `setupConnection` — it's only referenced in the JSX.

## Edge Cases Handled

- **Cancel while waiting**: `waitForUserInput()` listens to the abort signal and rejects the promise, preventing a permanent hang. The 300ms delay in `AgentContext.stop()` before abort is acceptable.
- **Double response**: `resolveUserInput()` nulls out the resolver after first call — safe.
- **Re-entrant waitForUserInput**: If somehow called twice, the previous promise is resolved with empty string before creating a new one.
- **Historical conversations**: Permission widgets loaded from history render as answered when a `navigator_widget_response` message exists (the `answered` flag and `response` are reconstructed by step 10D's backwards walk). Unanswered widgets (task was cancelled before user responded) render in `pending` state with interactive controls — consistent with `SuggestionActionWidget` behavior. Clicking a button in a stale historical session safely no-ops on the background side (see step 7 hazard note).
- **Side panel disconnect while waiting**: `port.onDisconnect` calls `currentExecutor?.cancel()` which triggers abort, which rejects the waiting promise.
- **Abort listener cleanup**: When `waitForUserInput()` resolves normally (user responds), the `{ once: true }` abort listener remains registered but is harmless — calling `reject` on an already-settled promise is a no-op in JavaScript. The listener fires at most once (if abort happens later) and is then garbage-collected with the `AbortSignal`. Since `AgentContext` is created per task, there is no cross-task listener leak.
- **Stop button during ask_user**: When the user clicks "Stop" in the UI, `handleStopTask` sends `cancel_task` → `executor.cancel()` → `context.stop()` → 300ms delay → `controller.abort()`. The abort signal triggers the `onAbort` callback in `waitForUserInput()`, which rejects the promise. The `doMultiAction` catch block handles the rejection (see step 3 abort error propagation note). The UI immediately enables input and hides the stop button (`handleStopTask` lines 996-997) regardless of the background resolution timing.

## Skipped from Original Plan

- **i18n keys**: The i18n package was removed in commit `1ce3d04`. All strings are plain English. No i18n keys needed.

## Verification

1. `pnpm -F chrome-extension type-check`
2. `pnpm -F side-panel type-check`
3. `pnpm -F chrome-extension build`
4. `pnpm -F side-panel build`
5. Manual test: Load extension, start a task that triggers `ask_user`, verify the widget appears, respond, verify agent continues with the response.
6. Manual test: Cancel a task while the `ask_user` widget is displayed — verify the agent stops cleanly.
7. Manual test: Load a historical conversation containing an ask_user interaction — verify the widget renders with the answered state.
