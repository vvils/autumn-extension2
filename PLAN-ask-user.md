# Implementation Plan: `ask_user` Navigator Action

## Context

The navigator agent currently runs autonomously and cannot pause to ask the user for input mid-task. This means tasks requiring user confirmation, decisions between options, or clarification must either be planned upfront or fail. Adding an `ask_user` action lets the navigator pause execution, present a question with optional structured context and choices in the side panel, wait for the user's response, and resume with that response in the agent's context.

## Files to Modify (in order)

### 1. `chrome-extension/src/background/agent/types.ts` — Add user input waiting to AgentContext

Add a resolver field and two methods to the `AgentContext` class after `costTracker` (line 53). Note: all existing AgentContext members are public (no access modifiers), so keep this consistent. Also initialize `userInputResolve = null` in the constructor body alongside the other field initializations (lines 69-78).

```typescript
userInputResolve: ((value: string) => void) | null = null;

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

> **[HAZARD]** Historical unanswered widgets: If a task is cancelled while `ask_user` is pending, the widget is persisted without `answered: true`. On historical load, it renders as "pending" with interactive controls. Clicking a button calls `handlePermissionResponse` → port message → background checks `if (currentExecutor)` and safely drops it — no side effects. The UI still updates to "answered" state, which is mildly misleading but harmless. Consistent with `SuggestionActionWidget` which also remains interactive in historical sessions. Severity: Low.

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

// Add case in switch:
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

Note: We persist with `actor: 'navigator_widget'` (not `'widget'`) to distinguish from synthesizer widgets during historical session loading. Navigator widgets are standalone messages (`actor: Actors.SYSTEM`) rather than being merged into the nearest synthesizer message. The existing `mergeWidgetIntoMessages` utility (`packages/storage/lib/chat/mergeWidget.ts`) merges into `Actors.SYNTHESIZER` messages and must NOT be used here.

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

**C) Pass to MessageList** (line 1232-1236):

```tsx
<MessageList
  messages={messages}
  isStreaming={isStreamingPlanner || isStreamingSynthesizer}
  onWidgetApply={handleWidgetApply}
  onWidgetRespond={handlePermissionResponse}
/>
```

**D) Update historical session loading** (lines 608-641 inside `setupConnection`). In the `conversation_messages_result` handler, add handling for `navigator_widget` and `navigator_widget_response` roles. These must be inserted between the existing `if (m.role === 'widget')` block (line 609) and the final `else` block (line 634):

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

## Edge Cases Handled

- **Cancel while waiting**: `waitForUserInput()` listens to the abort signal and rejects the promise, preventing a permanent hang. The 300ms delay in `AgentContext.stop()` before abort is acceptable.
- **Double response**: `resolveUserInput()` nulls out the resolver after first call — safe.
- **Re-entrant waitForUserInput**: If somehow called twice, the previous promise is resolved with empty string before creating a new one.
- **Historical conversations**: Permission widgets loaded from history render as answered (the `answered` flag and `response` are reconstructed from the persisted `navigator_widget_response` message). Unanswered widgets in historical sessions render in disabled state since `widget.data.answered` is falsy and the PermissionWidget should check this on mount.
- **Side panel disconnect while waiting**: `port.onDisconnect` calls `currentExecutor?.cancel()` which triggers abort, which rejects the waiting promise.

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
