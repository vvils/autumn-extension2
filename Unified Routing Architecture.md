# Unified Routing Architecture — Full Implementation Plan

## Context

The Autumn platform has two AI systems: (1) the extension's browser agent for web automation and (2) the backend's synthesizer pipeline for hotel domain Q&A (Planner → ArgRepair → Executor → Synthesizer). This document defines the unified routing architecture — the extension owns all browser automation locally, while the backend becomes a pure data pipeline (domain Q&A with full widget support including interactive charts, suggestion actions, and reasoning display). Backend browser-agent execution code and workflow infrastructure are removed; predefined workflow prompts are hardcoded in the extension as curated bookmarks.

**Scope:** Both extension and backend repos in a single pass.

**Repos:**
- Extension: `/home/wilson/Projects/autumn-w/autumn-extension2/`
- Backend: `/home/wilson/Projects/autumn-w/autumn-backend/`

---

## Architecture: 3-Path Routing

```
User Query → Extension Planner (step 0 classification)
  │
  ├── task_type: "general"
  │     → Planner sets done=true + final_answer
  │     → Executor exits via existing checkTaskCompletion() (line 116)
  │     → No code change needed — existing behavior
  │
  ├── task_type: "domain_query"
  │     → Executor short-circuits BEFORE the step loop
  │     → ServerClient.streamChat(query) → POST /ai/extension/chat
  │     → Server runs: planner → arg-repair → executor → synthesizer
  │     → Standard SSE chunks stream back (NOT Vercel AI SDK format)
  │     → EventManager emits SYNTHESIZER/STEP_STREAMING events
  │     → Side panel renders streaming response
  │     → If server returns "escalate" event → fall through to browser path
  │
  └── task_type: "browser"
        → Navigator loop runs (existing behavior, no changes)
        → query_hotel_data action available when server configured
        → Navigator calls query_hotel_data mid-task if needed
          → POST /ai/extension/query (non-streaming JSON)
        → Planner re-evaluates at planningInterval (existing)
```

No `hybrid` type — browser path always has `query_hotel_data` when server is configured.

---

## Step 1: Extension — Planner Schema & TaskType Enum

### File: `chrome-extension/src/background/agent/agents/planner.ts`

**1a. Add TaskType enum** (before line 22):

```typescript
export enum TaskType {
  GENERAL = 'general',
  DOMAIN_QUERY = 'domain_query',
  BROWSER = 'browser',
}

function resolveTaskType(taskType?: string, webTask?: boolean | string): TaskType {
  if (taskType) {
    const lower = taskType.trim().toLowerCase().replace(/[^a-z_]/g, '');
    if (['general', 'chat', 'direct', 'answer'].includes(lower)) return TaskType.GENERAL;
    if (['domain_query', 'domainquery', 'domain', 'query', 'hotel', 'data'].includes(lower))
      return TaskType.DOMAIN_QUERY;
    if (['browser', 'web', 'browse', 'navigate'].includes(lower)) return TaskType.BROWSER;
  }
  if (webTask === true || webTask === 'true') return TaskType.BROWSER;
  if (webTask === false || webTask === 'false') return TaskType.GENERAL;
  return TaskType.BROWSER; // safe default
}
```

**1b. Update plannerOutputSchema** (replace lines 22-44):

```typescript
const rawPlannerSchema = z.object({
  observation: z.string(),
  challenges: z.string(),
  done: z.union([
    z.boolean(),
    z.string().transform(val => {
      if (val.toLowerCase() === 'true') return true;
      if (val.toLowerCase() === 'false') return false;
      throw new Error('Invalid boolean string');
    }),
  ]),
  next_steps: z.string(),
  final_answer: z.string(),
  reasoning: z.string(),
  task_type: z.string().optional(),
  web_task: z
    .union([
      z.boolean(),
      z.string().transform(val => {
        if (val.toLowerCase() === 'true') return true;
        if (val.toLowerCase() === 'false') return false;
        throw new Error('Invalid boolean string');
      }),
    ])
    .optional(),
});

export const plannerOutputSchema = rawPlannerSchema.transform(data => ({
  ...data,
  task_type: resolveTaskType(
    data.task_type,
    data.web_task as boolean | string | undefined,
  ),
}));

export type PlannerOutput = z.infer<typeof plannerOutputSchema>;
```

This accepts BOTH `task_type` (string) and `web_task` (boolean) from the LLM, resolving to a `TaskType` enum value. Backward-compatible with LLMs that still output `web_task`.

---

## Step 2: Extension — Planner Prompt Changes

### File: `chrome-extension/src/background/agent/prompts/templates/planner.ts`

**Replace the entire template** (currently `plannerSystemPromptTemplate` is a static string). Convert to a function:

```typescript
import { commonSecurityRules } from './common';

export function buildPlannerSystemPrompt(options?: {
  serverAvailable?: boolean;
  hotelCapabilities?: string;
}): string {
  const taskTypeBlock = options?.serverAvailable
    ? `1. Classify the task and set the "task_type" field:
   - "general": The task can be answered from general knowledge. No hotel data or web browsing needed. Set done=true and provide final_answer.
   - "domain_query": The task is about hotel metrics, pricing, bookings, competitors, or other hotel data that can be answered from the hotel's internal data system. Do NOT use browser for these. Set done=true (the server will handle execution).
   - "browser": The task requires navigating websites, clicking, filling forms, or reading external web pages.

   Available hotel data (answerable via domain_query):
${options.hotelCapabilities || '   (no capabilities loaded)'}
`
    : `1. Classify the task and set the "task_type" field:
   - "general": The task can be answered directly without web navigation. Set done=true and provide final_answer.
   - "browser": The task requires navigating websites, clicking, filling forms, or reading web pages.
`;

  const domainQueryDoneRule = options?.serverAvailable
    ? `  - When task_type is "domain_query": set done=true. The server synthesizer will handle the query.
  - Set these fields to empty string: "observation", "challenges", "reasoning", "next_steps"
`
    : '';

  return `You are a helpful assistant. You are good at answering general questions and helping users break down web browsing tasks into smaller steps.

${commonSecurityRules}

# RESPONSIBILITIES:
${taskTypeBlock}
2. If task_type is "general", answer the task directly as a helpful assistant
  - Output the answer into "final_answer" field in the JSON object.
  - Set "done" field to true
  - Set these fields in the JSON object to empty string: "observation", "challenges", "reasoning", "next_steps"
  - Be kind and helpful when answering the task
  - Do NOT offer anything that users don't explicitly ask for.
  - Do NOT make up anything, if you don't know the answer, just say "I don't know"
${domainQueryDoneRule}
3. If task_type is "browser", help break down web tasks into smaller steps and reason about the current state
  - Analyze the current state and history
  - Evaluate progress towards the ultimate goal
  - Identify potential challenges or roadblocks
  - Suggest the next high-level steps to take
  - If you know the direct URL, use it directly instead of searching for it (e.g. github.com, www.espn.com, gmail.com). Search it if you don't know the direct URL.
  - Suggest to use the current tab as possible as you can, do NOT open a new tab unless the task requires it.
  - **ALWAYS break down web tasks into actionable steps, even if they require user authentication**
  - **Your role is strategic planning and evaluating the current state, not execution feasibility assessment**
  - IMPORTANT:
    - Always prioritize working with content visible in the current viewport first
    - Focus on elements that are immediately visible without scrolling
    - Only suggest scrolling if the required content is confirmed to not be in the current view
    - Scrolling is your LAST resort unless explicitly required by the task
    - NEVER suggest scrolling through the entire page, only scroll maximum ONE PAGE at a time.
    - If sign in or credentials are required, mark as done and ask user to sign in in final answer
    - When you set done to true, you must:
      * Provide the final answer to the user's task in the "final_answer" field
      * Set "next_steps" to empty string
      * The final_answer should be a complete, user-friendly response
  4. Only update task_type when you received a new task from the user, otherwise keep it as the same value.

# TASK COMPLETION VALIDATION:
When determining if a task is "done":
1. Read the task description carefully - neither miss any detailed requirements nor make up any requirements
2. Verify all aspects of the task have been completed successfully
3. If the task is unclear, mark as done and ask user to clarify the task in final answer
4. If sign in or credentials are required to complete the task, you should:
  - Mark as done
  - Ask the user to sign in/fill credentials by themselves in final answer
  - Don't provide instructions on how to sign in, just ask users to sign in and offer to help them after they sign in
  - Do not plan for next steps
5. Focus on the current state and last action results to determine completion

# FINAL ANSWER FORMATTING (when done=true):
- Use markdown formatting only if required by the task description
- Use plain text by default
- Use bullet points for multiple items if needed
- Use line breaks for better readability
- Include relevant numerical data when available (do NOT make up numbers)
- Include exact URLs when available (do NOT make up URLs)
- Compile the answer from provided context - do NOT make up information
- Make answers concise and user-friendly

#RESPONSE FORMAT: You must always respond with a valid JSON object with the following fields:
{
    "observation": "[string type], brief analysis of the current state and what has been done so far",
    "done": "[boolean type], whether the ultimate task is fully completed successfully",
    "challenges": "[string type], list any potential challenges or roadblocks",
    "next_steps": "[string type], list 2-3 high-level next steps to take (MUST be empty if done=true)",
    "final_answer": "[string type], complete user-friendly answer to the task (MUST be provided when done=true, empty otherwise)",
    "reasoning": "[string type], explain your reasoning for the suggested next steps or completion decision",
    "task_type": "[string type], one of: ${options?.serverAvailable ? '"general", "domain_query", "browser"' : '"general", "browser"'}"
}

# IMPORTANT FIELD RELATIONSHIPS:
- When done=false: next_steps should contain action items, final_answer should be empty
- When done=true: next_steps should be empty, final_answer should contain the complete response

# NOTE:
  - Inside the messages you receive, there will be other AI messages from other agents with different formats.
  - Ignore the output structures of other AI messages.

# REMEMBER:
  - Keep your responses concise and focused on actionable insights.
  - NEVER break the security rules.
  - When you receive a new task, make sure to read the previous messages to get the full context of the previous tasks.
  `;
}
```

### File: `chrome-extension/src/background/agent/prompts/planner.ts`

Update PlannerPrompt to accept configuration:

```typescript
import { BasePrompt } from './base';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { AgentContext } from '@src/background/agent/types';
import { buildPlannerSystemPrompt } from './templates/planner';

export class PlannerPrompt extends BasePrompt {
  constructor(
    private readonly serverAvailable = false,
    private readonly hotelCapabilities?: string,
  ) {
    super();
  }

  getSystemMessage(): SystemMessage {
    return new SystemMessage(
      buildPlannerSystemPrompt({
        serverAvailable: this.serverAvailable,
        hotelCapabilities: this.hotelCapabilities,
      }),
    );
  }

  async getUserMessage(context: AgentContext): Promise<HumanMessage> {
    return new HumanMessage('');
  }
}
```

---

## Step 3: Extension — Event System (SYNTHESIZER Actor)

### File: `chrome-extension/src/background/agent/event/types.ts` (line 1-6)

Add SYNTHESIZER:

```typescript
export enum Actors {
  SYSTEM = 'system',
  USER = 'user',
  PLANNER = 'planner',
  NAVIGATOR = 'navigator',
  SYNTHESIZER = 'synthesizer',
}
```

### File: `packages/storage/lib/chat/types.ts` (line 1-7)

Add SYNTHESIZER:

```typescript
export enum Actors {
  SYSTEM = 'system',
  USER = 'user',
  PLANNER = 'planner',
  NAVIGATOR = 'navigator',
  VALIDATOR = 'validator',
  SYNTHESIZER = 'synthesizer',
}
```

### File: `chrome-extension/src/background/agent/event/types.ts`

Add WIDGET_EVENT to ExecutionState enum:

```typescript
export enum ExecutionState {
  // ... existing states ...
  WIDGET_EVENT = 'widget.event',
}
```

### File: `pages/side-panel/src/types/message.ts`

Add synthesizer profile (after `evaluator`):

```typescript
synthesizer: {
  name: 'Synthesizer',
  icon: 'icons/synthesizer.svg',
  iconBackground: '#7C3AED',
},
```

### File: `pages/side-panel/public/icons/synthesizer.svg` (CREATE)

Simple purple brain/sparkle icon SVG.

---

## Step 4: Extension — ServerClient New Methods

### File: `chrome-extension/src/background/services/server/types.ts`

Add these interfaces (after `SyncConversationPayload`):

```typescript
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
```

### File: `chrome-extension/src/background/services/server/serverClient.ts`

Add three methods to the `ServerClient` class (after `syncConversation`):

```typescript
async *streamChat(
  messages: Array<{ role: string; content: string }>,
  conversationId?: string,
): AsyncGenerator<SSEEvent> {
  yield* this.apiClient.stream('/ai/extension/chat', { messages, conversationId });
}

async queryData(query: string): Promise<ExtensionQueryResponse> {
  const { data } = await this.apiClient.post<ExtensionQueryResponse>(
    '/ai/extension/query',
    { query },
  );
  return data;
}

async fetchHotelContext(): Promise<HotelContextManifest | null> {
  try {
    const { data } = await this.apiClient.get<HotelContextManifest>('/ai/extension/context');
    return data;
  } catch {
    return null;
  }
}
```

Add necessary imports at top:

```typescript
import type { SSEEvent, HotelContextManifest, ExtensionQueryResponse } from './types';
```

---

## Step 5: Extension — ActionBuilder (query_hotel_data)

### File: `chrome-extension/src/background/agent/actions/schemas.ts`

Add schema (at end of file):

```typescript
export const queryHotelDataActionSchema: ActionSchema = {
  name: 'query_hotel_data',
  description:
    "Query the hotel's internal data system for performance metrics, pricing, bookings, competitors, seasonal settings, and documentation.",
  schema: z.object({
    query: z.string().describe('Natural language query about hotel data'),
  }),
};
```

### File: `chrome-extension/src/background/agent/actions/builder.ts`

**5a.** Change constructor signature (line 147-150) to accept optional serverClient:

```typescript
constructor(
  context: AgentContext,
  extractorLLM: BaseChatModel,
  private readonly serverClient?: ServerClient | null,
) {
  this.context = context;
  this.extractorLLM = extractorLLM;
}
```

Add imports at top:

```typescript
import type { ServerClient } from '@src/background/services/server';
import { queryHotelDataActionSchema } from './schemas';
```

**5b.** At the END of `buildDefaultActions()` method (before the return), add:

```typescript
if (this.serverClient) {
  const serverClient = this.serverClient;
  const context = this.context;
  actions.push(
    new Action(
      async (params: { query: string }) => {
        try {
          context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, t('act_queryHotelData_start'));
          const result = await serverClient.queryData(params.query);
          if (result.escalation) {
            context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, t('act_queryHotelData_escalated'));
            return new ActionResult({
              extractedContent: '[Hotel data unavailable for this query — requires browser]',
              includeInMemory: true,
            });
          }
          context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, t('act_queryHotelData_ok'));
          return new ActionResult({
            extractedContent: result.text ?? '',
            includeInMemory: true,
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({
            extractedContent: `[Hotel data query failed: ${errorMsg}]`,
            error: errorMsg,
            includeInMemory: true,
          });
        }
      },
      queryHotelDataActionSchema,
    ),
  );
}
```

---

## Step 6: Extension — Executor Routing

### File: `chrome-extension/src/background/agent/executor.ts`

**6a. Add imports** (at top):

```typescript
import { TaskType } from './agents/planner';
```

**6b. Add hotelCapabilities to ExtraArgs** (line 32-38):

```typescript
export interface ExecutorExtraArgs {
  plannerLLM?: BaseChatModel;
  extractorLLM?: BaseChatModel;
  agentOptions?: Partial<AgentOptions>;
  generalSettings?: GeneralSettingsConfig;
  serverClient?: ServerClient | null;
  hotelCapabilities?: string;
}
```

Add a `conversationMessages` field to the Executor class for multi-turn domain query context:

```typescript
// In the Executor class body:
private conversationMessages: Array<{ role: string; content: string }> = [];
```

Append to `conversationMessages` when:
- General answer completes → `{ role: 'assistant', content: finalAnswer }`
- Domain query completes → `{ role: 'assistant', content: fullText }`
- User sends a follow-up → `{ role: 'user', content: task }` (handled in `executeDomainQuery()`)

```typescript
// After general answer completion (in checkTaskCompletion or equivalent):
this.conversationMessages.push({ role: 'assistant', content: this.context.finalAnswer });

// After domain query completion (in executeDomainQuery, after TASK_OK emit):
this.conversationMessages.push({ role: 'assistant', content: fullText });
```

**6c. Update constructor** — pass serverClient to ActionBuilder and configure PlannerPrompt:

Line 73 — change PlannerPrompt instantiation:

```typescript
this.plannerPrompt = new PlannerPrompt(
  !!this.serverClient,
  extraArgs?.hotelCapabilities,
);
```

Line 75 — pass serverClient to ActionBuilder:

```typescript
const actionBuilder = new ActionBuilder(context, extractorLLM, this.serverClient);
```

**6d. Restructure execute() method** (lines 132-234):

Replace the current `execute()` body with this restructured flow:

```typescript
async execute(): Promise<void> {
  logger.info(`Executing task: ${this.tasks[this.tasks.length - 1]}`);
  const context = this.context;
  context.nSteps = 0;
  const allowedMaxSteps = this.context.options.maxSteps;

  try {
    this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_START, this.context.taskId);
    void analytics.trackTaskStart(this.context.taskId);

    let step = 0;
    let latestPlanOutput: AgentOutput<PlannerOutput> | null = null;
    let navigatorDone = false;

    // Step 0: Initial planner classification
    latestPlanOutput = await this.runPlanner();

    // Domain query path: check BEFORE general completion check
    // (planner sets done=true for domain_query, so checkTaskCompletion
    // would exit early and the domain query path would never execute)
    if (
      latestPlanOutput?.result?.task_type === TaskType.DOMAIN_QUERY &&
      this.serverClient
    ) {
      const result = await this.executeDomainQuery();
      if (result === 'completed') return;
      if (result === 'error') {
        // Show error in side panel but don't fall through to browser
        return;
      }
      // 'escalated' — fall through to browser loop
    }

    // General path: planner answered directly
    if (this.checkTaskCompletion(latestPlanOutput)) {
      const finalMessage = this.context.finalAnswer || this.context.taskId;
      this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_OK, finalMessage);
      void analytics.trackTaskComplete(this.context.taskId);
      return;
    }

    // Browser path: existing step loop
    for (step = 0; step < allowedMaxSteps; step++) {
      context.stepInfo = {
        stepNumber: context.nSteps,
        maxSteps: context.options.maxSteps,
      };

      logger.info(`Step ${step + 1} / ${allowedMaxSteps}`);
      if (await this.shouldStop()) {
        break;
      }

      // Run planner periodically (skip step 0 since we already ran it above)
      if (
        this.planner &&
        (step > 0 || latestPlanOutput?.result?.task_type === TaskType.DOMAIN_QUERY) &&
        (context.nSteps % context.options.planningInterval === 0 || navigatorDone)
      ) {
        navigatorDone = false;
        latestPlanOutput = await this.runPlanner();

        if (this.checkTaskCompletion(latestPlanOutput)) {
          break;
        }
      }

      // Execute navigator
      navigatorDone = await this.navigate();

      if (navigatorDone) {
        logger.info('Navigator indicates completion — will be validated by next planner run');
      }
    }

    // Determine task completion status
    const isCompleted = latestPlanOutput?.result?.done === true;

    if (isCompleted) {
      const finalMessage = this.context.finalAnswer || this.context.taskId;
      this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_OK, finalMessage);
      void analytics.trackTaskComplete(this.context.taskId);
    } else if (step >= allowedMaxSteps) {
      logger.error('Task failed: Max steps reached');
      this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_FAIL, t('exec_errors_maxStepsReached'));
      const maxStepsError = new MaxStepsReachedError(t('exec_errors_maxStepsReached'));
      const errorCategory = analytics.categorizeError(maxStepsError);
      void analytics.trackTaskFailed(this.context.taskId, errorCategory);
    } else if (this.context.stopped) {
      this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_CANCEL, t('exec_task_cancel'));
      void analytics.trackTaskCancelled(this.context.taskId);
    } else {
      this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_PAUSE, t('exec_task_pause'));
    }
  } catch (error) {
    if (error instanceof RequestCancelledError) {
      this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_CANCEL, t('exec_task_cancel'));
      void analytics.trackTaskCancelled(this.context.taskId);
    } else {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_FAIL, t('exec_task_fail', [errorMessage]));
      const errorCategory = analytics.categorizeError(error instanceof Error ? error : errorMessage);
      void analytics.trackTaskFailed(this.context.taskId, errorCategory);
    }
  } finally {
    if (import.meta.env.DEV) {
      logger.debug('Executor history', JSON.stringify(this.context.history, null, 2));
    }
    if (this.generalSettings?.replayHistoricalTasks) {
      const historyString = JSON.stringify(this.context.history);
      logger.info(`Executor history size: ${historyString.length}`);
      await chatHistoryStore.storeAgentStepHistory(this.context.taskId, this.tasks[0], historyString);
    } else {
      logger.info('Replay historical tasks is disabled, skipping history storage');
    }
  }
}
```

> **⚠️ ORDERING HAZARD:** The domain_query check MUST remain BEFORE `checkTaskCompletion()`. The planner sets `done=true` for domain queries, so if `checkTaskCompletion()` runs first, it intercepts the task as a "general" completion and domain queries silently break. If this code is refactored, preserve the check order or extract into a named method like `handleDomainQueryIfApplicable()`.

**6e. Add executeDomainQuery() method** (new private method):

```typescript
type DomainQueryResult = 'completed' | 'escalated' | 'error';

private async executeDomainQuery(): Promise<DomainQueryResult> {
  const task = this.tasks[this.tasks.length - 1];
  try {
    // Conversation context built from executor's tracked messages.
    // The executor appends to this.conversationMessages on each
    // completed general answer or domain query response.
    const conversationHistory = [
      ...this.conversationMessages,
      { role: 'user' as const, content: task },
    ];

    const stream = this.serverClient!.streamChat(conversationHistory);
    let fullText = '';

    for await (const event of stream) {
      switch (event.event) {
        case 'chunk':
          fullText += event.data;
          this.context.emitEvent(Actors.SYNTHESIZER, ExecutionState.STEP_STREAMING, fullText);
          break;
        case 'widget':
          this.context.emitEvent(Actors.SYNTHESIZER, ExecutionState.WIDGET_EVENT, event.data);
          break;
        case 'sources':
          break;
        case 'escalate':
          if (fullText) {
            this.context.emitEvent(
              Actors.SYNTHESIZER,
              ExecutionState.STEP_OK,
              fullText,
            );
          }
          return 'escalated';
        case 'done':
          this.context.finalAnswer = event.data;
          this.context.emitEvent(Actors.SYNTHESIZER, ExecutionState.STEP_OK, event.data);
          this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_OK, event.data);
          void analytics.trackTaskComplete(this.context.taskId);
          return 'completed';
        case 'error':
          throw new Error(event.data);
      }
    }

    if (fullText) {
      this.context.finalAnswer = fullText;
      this.context.emitEvent(Actors.SYNTHESIZER, ExecutionState.STEP_OK, fullText);
      this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_OK, fullText);
      void analytics.trackTaskComplete(this.context.taskId);
    }
    return 'completed';
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Domain query failed: ${errorMessage}`);
    this.context.emitEvent(
      Actors.SYNTHESIZER,
      ExecutionState.STEP_FAIL,
      t('exec_domainQuery_fail', [errorMessage]),
    );
    return 'error';
  }
}
```

**Cancellation:** The `streamChat()` call should accept an `AbortSignal` from `this.context`. When the user cancels mid-stream, the signal aborts the fetch, the async generator terminates, and partial `fullText` is emitted as `STEP_OK` before the method returns `'error'`. The executor's existing `shouldStop()` check handles the rest.

---

## Step 7: Extension — Background Index (Hotel Context Caching)

### File: `chrome-extension/src/background/index.ts`

**7a.** Add a cached hotel capabilities variable near the serverClient initialization (~line 73):

```typescript
let cachedHotelCapabilities: string | undefined;
```

**7b.** In `initServerClient()`, after successful creation, fetch hotel context:

```typescript
async function initServerClient() {
  serverClient = await ServerClient.create(serverSettingsStore);
  cachedHotelCapabilities = undefined;

  if (serverClient) {
    logger.info('Server client initialized');
    try {
      if (await serverClient.isAuthenticated()) {
        const manifest = await serverClient.fetchHotelContext();
        if (manifest) {
          cachedHotelCapabilities = manifest.capabilities
            .map(c => `   - ${c.name}: ${c.description}`)
            .join('\n');
          logger.info(`Hotel context loaded: ${manifest.capabilities.length} capabilities`);
        }
      }
    } catch (error) {
      logger.warn('Failed to fetch hotel context:', error);
    }
  } else {
    logger.info('Server not configured, standalone mode');
  }
}
```

**7c.** Where the Executor is created (~line 408-476), pass `hotelCapabilities`:

```typescript
const executor = new Executor(task, taskId, browserContext, navigatorLLM, {
  plannerLLM: plannerLLM ?? navigatorLLM,
  agentOptions: { /* ... existing ... */ },
  generalSettings: generalSettings,
  serverClient,
  hotelCapabilities: cachedHotelCapabilities,
});
```

---

## Step 8: Extension — Side Panel SYNTHESIZER Handling

### File: `pages/side-panel/src/SidePanel.tsx`

**8a.** Add a `synthesizerStreamingRef` alongside `plannerStreamingRef`:

```typescript
const synthesizerStreamingRef = useRef(false);
```

**8b.** In `handleTaskState`, add a `case 'synthesizer':` block. Insert it after the `case Actors.NAVIGATOR:` block (after line 273), before the `case Actors.VALIDATOR:` block.

The handler processes both text streaming and widget events. Widget data is stored in a `widgets` array alongside the message content, enabling inline rendering of charts, suggestion actions, and reasoning displays:

```typescript
case 'synthesizer':
  switch (state) {
    case ExecutionState.STEP_START:
      displayProgress = true;
      break;
    case ExecutionState.STEP_STREAMING:
      setMessages(prev => {
        const filtered = prev.filter(
          (msg, idx) => !(msg.content === progressMessage && idx === prev.length - 1),
        );
        if (synthesizerStreamingRef.current) {
          return [...filtered.slice(0, -1), { actor, content: content || '', timestamp }];
        } else {
          synthesizerStreamingRef.current = true;
          return [...filtered, { actor, content: content || '', timestamp }];
        }
      });
      return;
    case ExecutionState.WIDGET_EVENT: {
      // Widget data arrives as JSON with widgetId for identity:
      // { widgetId: string, type: "data-suggestion-action" | "data-hotel-metrics-data" | "data-custom-reasoning", data: {...} }
      // If a widget with the same widgetId exists, UPDATE in place (for streaming state
      // changes like isStreaming: true → false). Otherwise, APPEND as a new widget.
      // This enables CustomReasoningWidget to transition from streaming to complete state.
      const widgetData = typeof content === 'string' ? JSON.parse(content) : content;
      setMessages(prev => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        const existingWidgets = last.widgets || [];
        const existingIdx = existingWidgets.findIndex(
          (w: any) => w.widgetId && w.widgetId === widgetData.widgetId,
        );
        const widgets =
          existingIdx >= 0
            ? existingWidgets.map((w: any, i: number) => (i === existingIdx ? widgetData : w))
            : [...existingWidgets, widgetData];
        return [...prev.slice(0, -1), { ...last, widgets }];
      });
      return;
    }
    case ExecutionState.STEP_OK: {
      const wasStreaming = synthesizerStreamingRef.current;
      synthesizerStreamingRef.current = false;
      if (wasStreaming) {
        setMessages(prev => {
          if (prev.length > 0) {
            const last = prev[prev.length - 1];
            const finalContent = content || last.content;
            const finalMessage = { ...last, content: finalContent, timestamp };
            const effectiveSessionId = sessionIdRef.current;
            if (effectiveSessionId) {
              chatHistoryStore
                .addMessage(effectiveSessionId, finalMessage)
                .catch(err => console.error('Failed to save message to history:', err));
            }
            return [...prev.slice(0, -1), finalMessage];
          }
          return prev;
        });
      } else {
        skip = false;
      }
      break;
    }
    case ExecutionState.STEP_FAIL:
      synthesizerStreamingRef.current = false;
      skip = false;
      break;
    default:
      return;
  }
  break;
```

Note: The `Actors` type imported from `@extension/storage` must include `SYNTHESIZER` (done in Step 3). The `handleTaskState` switch compares string values, so `'synthesizer'` matches the enum value.

### File: `packages/storage/lib/chat/types.ts`

Add widgets field to the message interface:

```typescript
export interface ChatMessage {
  // ... existing fields ...
  widgets?: Array<{
    widgetId: string;
    type: 'data-hotel-metrics-data' | 'data-suggestion-action' | 'data-custom-reasoning';
    data: Record<string, unknown>;
  }>;
}
```

---

## Step 9: Backend — ExtensionController

### CREATE: `src/modules/ai/controllers/extension.controller.ts`

```typescript
import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  UseGuards,
  Logger,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/shared/providers/jwt.auth.guard';
import { ChatOrchestratorService } from '../../../lib/ai/services/chat-orchestrator.service';

@ApiTags('AI Extension')
@Controller('ai/extension')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ExtensionController {
  private readonly logger = new Logger(ExtensionController.name);

  constructor(
    private readonly chatOrchestrator: ChatOrchestratorService,
  ) {}

  @Post('chat')
  async chat(
    @Body() body: { messages: Array<{ role: string; content: string }>; conversationId?: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const userId = (req as any).user.id;
    const lastMessage = body.messages[body.messages.length - 1]?.content || '';
    this.logger.log(`Extension chat request from user ${userId}: "${lastMessage.slice(0, 80)}"`);

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(': ping\n\n');

    try {
      await this.chatOrchestrator.handleExtensionChat(
        body.messages,
        userId,
        res,
        body.conversationId,
      );
    } catch (error) {
      this.logger.error(`Extension chat failed: ${error.message}`, error.stack);
      if (!res.writableEnded) {
        res.write(`event: error\ndata: ${error.message}\n\n`);
        res.end();
      }
    }
  }

  @Post('query')
  async query(
    @Body() body: { query: string },
    @Req() req: Request,
  ) {
    const userId = (req as any).user.id;
    this.logger.log(`Extension query request from user ${userId}: "${body.query.slice(0, 80)}"`);
    return this.chatOrchestrator.handleExtensionQuery(body.query, userId);
  }

  @Get('context')
  async context(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.chatOrchestrator.getHotelContextManifest(userId);
  }
}
```

---

## Step 10: Backend — Orchestrator New Methods

### File: `src/lib/ai/services/chat-orchestrator.service.ts`

Add these three public methods and one private helper. No modifications to existing methods.

**10a. `writeSSE()` helper** (private) — must handle multi-line data per SSE spec:

```typescript
private writeSSE(res: Response, event: string, data: string): void {
  res.write(`event: ${event}\n`);
  for (const line of data.split('\n')) {
    res.write(`data: ${line}\n`);
  }
  res.write('\n');
}
```

**10b. `handleExtensionChat()`** — Streaming SSE for domain queries with widget support:

SSE event types:

| Event | Payload | Purpose |
|-------|---------|---------|
| `chunk` | text delta (string) | Streaming synthesizer text |
| `widget` | `{ type: string, data: object }` | Widget data (charts, suggestions, reasoning) |
| `sources` | JSON array of tool names | Data source attribution |
| `done` | full synthesized text (string) | Stream completion signal |
| `escalate` | `{ reason: string, context?: string }` | Browser fallback signal |
| `error` | error message (string) | Error termination |

```typescript
async handleExtensionChat(
  messages: Array<{ role: string; content: string }>,
  userId: string,
  res: Response,
  conversationId?: string,
): Promise<void> {
  const requestId = generateRequestId();
  const startTime = Date.now();

  this.logger.log(`[${requestId}] Extension chat started for user ${userId}`);

  const hotelContext = await this.usersService.buildHotelContext(userId);
  if (!hotelContext) {
    this.writeSSE(res, 'error', 'Hotel context not found');
    res.end();
    return;
  }

  const context: RequestContext = {
    userId,
    hotelContext,
    requestId,
    startTime,
    conversationId,
  };

  const noOpWriter = { write: () => {}, merge: () => {} };

  try {
    // Phase 1: Planning
    const { queries: plannedQueryCalls, requiresBrowser } = await this.planner.plan(
      messages, context, noOpWriter as any,
    );

    // Check if browser is needed → escalate
    if (requiresBrowser) {
      this.writeSSE(res, 'escalate', JSON.stringify({
        reason: 'needs_browser',
        context: 'Server planner determined browser automation is needed',
      }));
      res.end();
      return;
    }

    // Phase 2: Execute queries
    let queryResults: any[] = [];
    if (plannedQueryCalls.length > 0) {
      const repairedQueryCalls = await this.argRepairer.repair(plannedQueryCalls, context);
      queryResults = await this.executor.execute(repairedQueryCalls, context);
    }

    // Phase 3: Stream synthesizer response with widget callbacks
    const synthResult = await this.synthesizer.synthesizeForExtension(
      messages, queryResults, context,
      {
        onChunk: (chunk: string) => this.writeSSE(res, 'chunk', chunk),
        onWidget: (type: string, data: unknown) =>
          this.writeSSE(res, 'widget', JSON.stringify({
            widgetId: (data as any)?.id ?? crypto.randomUUID(),
            type,
            data,
          })),
      },
    );

> **Note:** Tools that emit streaming updates (e.g., `CustomReasoningWidget`) MUST use a stable `id` field in their data object across all emissions for the same widget instance. The `widgetId` in the SSE envelope reads `data.id` first and only falls back to `crypto.randomUUID()` for stateless widgets. Without a stable `id`, the side panel cannot match-and-update widgets in place (see hazard H6).

    // Send sources and done
    const sources = queryResults
      .filter((q: any) => q.ok)
      .map((q: any) => q.tool);
    this.writeSSE(res, 'sources', JSON.stringify(sources));
    this.writeSSE(res, 'done', synthResult);

    // Save to chat history
    if (conversationId) {
      try {
        const lastUserMessage = messages[messages.length - 1]?.content || '';
        await this.chatHistoryService.saveMessages(userId, conversationId, lastUserMessage, synthResult);
      } catch (saveErr) {
        this.logger.warn(`[${requestId}] Failed to save extension chat: ${saveErr.message}`);
      }
    }

    const latency = Date.now() - startTime;
    this.logger.log(`[${requestId}] Extension chat completed in ${latency}ms`);
  } catch (error) {
    this.logger.error(`[${requestId}] Extension chat failed: ${error.message}`, error.stack);
    this.writeSSE(res, 'error', error.message);
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
}
```

**10c. `handleExtensionQuery()`** — Non-streaming JSON for mid-task data:

```typescript
async handleExtensionQuery(
  query: string,
  userId: string,
): Promise<{
  text: string | null;
  sources: string[];
  latency: number;
  escalation: { reason: string } | null;
}> {
  const requestId = generateRequestId();
  const startTime = Date.now();

  this.logger.log(`[${requestId}] Extension query started for user ${userId}`);

  const hotelContext = await this.usersService.buildHotelContext(userId);
  if (!hotelContext) {
    return { text: null, sources: [], latency: Date.now() - startTime, escalation: null };
  }

  const context: RequestContext = {
    userId,
    hotelContext,
    requestId,
    startTime,
  };

  const messages = [{ role: 'user', content: query }];
  const noOpWriter = { write: () => {}, merge: () => {} };

  try {
    // Plan
    const { queries: plannedQueryCalls, requiresBrowser } = await this.planner.plan(
      messages, context, noOpWriter as any,
    );

    if (requiresBrowser) {
      return {
        text: null,
        sources: [],
        latency: Date.now() - startTime,
        escalation: { reason: 'needs_browser' },
      };
    }

    // Execute queries
    let queryResults: any[] = [];
    if (plannedQueryCalls.length > 0) {
      const repairedQueryCalls = await this.argRepairer.repair(plannedQueryCalls, context);
      queryResults = await this.executor.execute(repairedQueryCalls, context);
    }

    // Synthesize (non-streaming, reuse handleChatBatch approach)
    const systemPrompt = this.buildBatchSystemPrompt(
      hotelContext,
      queryResults.map(eq => ({ tool: eq.tool, ok: eq.ok, data: eq.ok ? eq.data : undefined, error: eq.ok ? undefined : eq.error })),
    );

    const result = await generateText({
      model: anthropic(this.SYNTHESIZER_MODEL),
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    });

    return {
      text: result.text,
      sources: queryResults.filter((q: any) => q.ok).map((q: any) => q.tool),
      latency: Date.now() - startTime,
      escalation: null,
    };
  } catch (error) {
    this.logger.error(`[${requestId}] Extension query failed: ${error.message}`, error.stack);
    return { text: null, sources: [], latency: Date.now() - startTime, escalation: null };
  }
}
```

**10d. `getHotelContextManifest()`** — Hotel context for extension:

```typescript
async getHotelContextManifest(userId: string): Promise<any> {
  const hotelContext = await this.usersService.buildHotelContext(userId);
  if (!hotelContext) return null;

  const capabilities = [
    {
      name: 'performance_metrics',
      description: 'ADR, RevPAR, occupancy, revenue by date range with YoY comparison',
      examples: ["What's our ADR?", 'Show occupancy for next month'],
    },
    {
      name: 'pricing_config',
      description: 'Floor/ceiling rates, base prices, competitor rates, SLTLY comparison',
      examples: ["What's our standard room rate?", 'Show pricing for next week'],
    },
    {
      name: 'booking_curves',
      description: 'Booking pace, pickup, velocity, checkpoints',
      examples: ['How are bookings pacing?', 'Show pickup for March 15'],
    },
    {
      name: 'seasonal_settings',
      description: 'Seasonal pricing configuration and adjustments',
      examples: ['Show seasonal pricing'],
    },
    {
      name: 'room_types',
      description: 'Room type configuration and price offsets',
      examples: ['Show room type settings'],
    },
    {
      name: 'documentation',
      description: 'Platform user manual and documentation search',
      examples: ['How do I set up seasonal pricing?'],
    },
  ];

  if (hotelContext.hasCompetitorData) {
    capabilities.push({
      name: 'competitor_data',
      description: 'Competitor rates and positioning',
      examples: ['What are competitors charging?'],
    });
  }
  if (hotelContext.hasMarketingIntegration) {
    capabilities.push({
      name: 'google_ads',
      description: 'Campaign performance, spend, ROAS',
      examples: ['How are our Google Ads performing?'],
    });
  }

  return {
    hotel: {
      name: hotelContext.propertyName || 'Unknown',
      timezone: hotelContext.timezone,
      currentDate: hotelContext.currentDate,
      currency: hotelContext.currency || { code: 'USD' },
      roomTypes: hotelContext.roomTypes,
    },
    capabilities,
    flags: {
      hasCompetitorData: hotelContext.hasCompetitorData,
      hasMarketingIntegration: hotelContext.hasMarketingIntegration,
      isMarketingOnly: hotelContext.isMarketingOnly,
    },
  };
}
```

Note: `generateText` and `openai` are already imported at top of file.

---

## Step 11: Backend — Synthesizer Extension Method

### File: `src/lib/ai/services/synthesizer.service.ts`

Add `synthesizeForExtension()` method. This uses all 6 synthesizer tools (same set as the web app) and streams both text and widget events via an SSE adapter:

**Tools included:**

| Tool | Type | Widget Event |
|------|------|-------------|
| `getBookingCurve` | read-only | `data-hotel-metrics-data` |
| `getPerformanceSummary` | read-only | `data-hotel-metrics-data` |
| `suggestUpdateFloorCeiling` | suggestion | `data-suggestion-action` |
| `suggestUpdateSeasonalSettings` | suggestion | `data-suggestion-action` |
| `suggestRoomTypePriceOverride` | suggestion | `data-suggestion-action` |
| `suggestOpenSupportTicket` | suggestion | `data-suggestion-action` |

The suggestion tools normally write widgets via `dataStream.write({ type: "data-suggestion-action", data: widget })`. For the extension, a thin adapter intercepts these writes and emits them as `widget` SSE events via the `onWidget` callback.

```typescript
async synthesizeForExtension(
  messages: Array<{ role: string; content: string }>,
  queryResults: ExecutedQuery[],
  context: RequestContext,
  callbacks: {
    onChunk: (text: string) => void;
    onWidget: (type: string, data: unknown) => void;
  },
): Promise<string> {
  const startTime = Date.now();

  try {
    this.logger.log(
      `[${context.requestId}] Starting extension synthesizer with ${messages.length} messages and ${queryResults.length} query results`,
    );

    const aiMessages = this.convertToAIMessages(messages);
    if (aiMessages.length === 0) {
      throw new Error('No valid messages after filtering');
    }

    const hasGoogleAdsQuery = queryResults.some(r => r.tool === 'getGoogleAdsPerformance');
    const isMarketingOnly = context.hotelContext?.isMarketingOnly ?? false;
    const timezone = context.clientTimezone || context.hotelContext.timezone;
    const currentDateTime = formatCurrentDateTimeForPrompting(timezone);

    const systemPrompt = buildCompleteSynthesizerPrompt(
      { hotelContext: context.hotelContext, currentDateTime },
      queryResults,
      hasGoogleAdsQuery,
      isMarketingOnly,
      context.pageContext,
      context.customInstructions,
    );

    // SSE adapter: intercepts dataStream.write() calls from suggestion tools
    // and emits them as widget events instead of writing to UIMessageStreamWriter
    const sseDataStreamAdapter: UIMessageStreamWriter = {
      write: (event: { type: string; data: unknown }) => {
        if (
          event.type === 'data-suggestion-action' ||
          event.type === 'data-hotel-metrics-data' ||
          event.type === 'data-custom-reasoning'
        ) {
          callbacks.onWidget(event.type, event.data);
        }
      },
      merge: () => {},
    };

    // All 6 tools — same set as the web app synthesizer
    const toolDeps = {
      userId: context.userId,
      usersService: this.usersService,
      requestId: context.requestId,
    };

    const tools = {
      // Read-only tools (query hotel data, emit data-hotel-metrics-data widgets)
      getBookingCurve: getBookingCurveTool(toolDeps),
      getPerformanceSummary: getPerformanceSummaryTool(toolDeps),
      // Suggestion tools (emit data-suggestion-action widgets via adapter)
      suggestUpdateFloorCeiling: suggestUpdateFloorCeilingTool({
        ...toolDeps,
        dataStream: sseDataStreamAdapter,
      }),
      suggestUpdateSeasonalSettings: suggestUpdateSeasonalSettingsTool({
        ...toolDeps,
        dataStream: sseDataStreamAdapter,
      }),
      suggestRoomTypePriceOverride: suggestRoomTypePriceOverrideTool({
        ...toolDeps,
        dataStream: sseDataStreamAdapter,
      }),
      suggestOpenSupportTicket: suggestOpenSupportTicketTool({
        ...toolDeps,
        dataStream: sseDataStreamAdapter,
      }),
    };

    const result = streamText({
      model: anthropic(this.SYNTHESIZER_MODEL),
      system: systemPrompt,
      messages: aiMessages,
      tools,
      stopWhen: stepCountIs(20),
    });

    let fullText = '';
    for await (const part of result.textStream) {
      fullText += part;
      callbacks.onChunk(part);
    }

    const latency = Date.now() - startTime;
    this.logger.log(
      `[${context.requestId}] Extension synthesizer completed in ${latency}ms, ${fullText.length} chars`,
    );

    return fullText;
  } catch (error) {
    const latency = Date.now() - startTime;
    this.logger.error(
      `[${context.requestId}] Extension synthesizer failed after ${latency}ms: ${error.message}`,
      error.stack,
    );
    throw error;
  }
}
```

Add imports at top (some may already be imported):

```typescript
import { streamText, stepCountIs, type UIMessageStreamWriter } from 'ai';
import {
  getBookingCurveTool,
  getPerformanceSummaryTool,
  suggestUpdateFloorCeilingTool,
  suggestUpdateSeasonalSettingsTool,
  suggestRoomTypePriceOverrideTool,
  suggestOpenSupportTicketTool,
} from '../tools';
```

---

## Step 12: Backend — Module Wiring

### File: `src/modules/ai/ai.module.ts`

Add import and register controller. Remove workflow providers and controller since workflows are now hardcoded prompts in the extension:

```typescript
import { ExtensionController } from './controllers/extension.controller';

// In @Module:
controllers: [AiController, ExtensionController],
// Remove: WorkflowController
```

No other changes — synthesizer and query pipeline services remain.

---

## Step 13: i18n Keys

Add to all three locale files (`packages/i18n/locales/en/messages.json`, `pt_BR/messages.json`, `zh_TW/messages.json`):

```json
"exec_domainQuery_fail": {
  "message": "Domain query failed, falling back to browser: $ERROR$",
  "placeholders": {
    "error": {
      "content": "$1",
      "example": "Network error"
    }
  }
},
"act_queryHotelData_start": {
  "message": "Querying hotel data..."
},
"act_queryHotelData_ok": {
  "message": "Hotel data retrieved"
},
"act_queryHotelData_escalated": {
  "message": "Hotel data unavailable - needs browser"
}
```

Then rebuild: `pnpm -F @extension/i18n build`

---

## Step 14: Extension — Widget React Components

The extension side panel renders three widget types inline with synthesizer text messages. Widget data arrives via `WIDGET_EVENT` execution state events and is stored in a `widgets` array on the message object.

### 14a. HotelMetricsWidget

**File:** `pages/side-panel/src/components/widgets/HotelMetricsWidget.tsx`

Interactive Recharts bar/line chart with STLY (Same Time Last Year) comparison.

**Features:**
- Metric selector dropdown: occupancy, revenue, ADR, RevPAR, bookings
- STLY toggle switch for year-over-year comparison
- Summary row: current value, STLY value, ± delta with color coding (green positive, red negative)
- Expand modal for detailed view
- Responsive sizing within side panel width

**Data shape:** `HotelMetricsDataWidgetSpecV1` schema (from backend `widgets/schemas/widget.schema.ts`)

```typescript
interface HotelMetricsDataWidget {
  type: 'data-hotel-metrics-data';
  data: {
    metrics: Array<{
      date: string;
      occupancy?: number;
      revenue?: number;
      adr?: number;
      revpar?: number;
      bookings?: number;
    }>;
    stlyMetrics?: Array<{/* same shape */}>;
    summary: {
      metric: string;
      current: number;
      stly?: number;
      delta?: number;
      deltaPercent?: number;
    };
    dateRange: { start: string; end: string };
  };
}
```

**Dependencies:** Add `recharts` to `pages/side-panel/package.json`

### 14b. SuggestionActionWidget

**File:** `pages/side-panel/src/components/widgets/SuggestionActionWidget.tsx`

Actionable suggestion card with Apply/Dismiss buttons.

**Features:**
- Current vs suggested values display (table or side-by-side)
- Apply/Dismiss action buttons
- 5-state machine: `idle` → `applying` → `success` / `error` → `dismissed`
- On Apply: extension calls backend API using `apiCall.endpoint` + `apiCall.payload` from widget data, authenticated via ServerClient
- Error handling: validation errors (show parsed message), auth failures (prompt re-login), network errors (show retry)
- Auto-dismiss after success (3s delay)

**Data shape:** `SuggestionActionWidgetSpecV1` schema (from backend `widgets/schemas/suggestion-widget.schema.ts`)

```typescript
interface SuggestionActionWidget {
  type: 'data-suggestion-action';
  data: {
    id: string;
    title: string;
    description: string;
    currentValues: Record<string, unknown>;
    suggestedValues: Record<string, unknown>;
    apiCall: {
      endpoint: string;
      method: 'POST' | 'PATCH';
      payload: Record<string, unknown>;
    };
    metadata?: Record<string, unknown>;
  };
}
```

**Apply flow:**
1. User clicks Apply → state transitions to `applying` (spinner on button)
2. Side panel sends message to background → background calls `serverClient.apiClient.request(endpoint, method, payload)`
3. Success → state transitions to `success` (checkmark) → auto-dismiss after 3s
4. Failure → state transitions to `error` (error message shown inline) → user can retry or dismiss

**Apply message protocol** (side panel → background → server):

1. Side panel sends `{ type: 'widget_apply', apiCall: { endpoint, method, payload } }` via `portRef.current.postMessage(...)`
2. Background handler in `index.ts` receives on the port, proxies directly: `serverClient.apiClient[method](endpoint, payload)`
3. Background replies via port with `{ type: 'widget_apply_result', success: true }` or `{ success: false, error }`
4. Side panel updates widget state accordingly (success → checkmark, failure → inline error)

**Background handler:** Add `case 'widget_apply'` to the port message switch in `index.ts`:

```typescript
case 'widget_apply': {
  const { endpoint, method, payload } = message.apiCall;
  try {
    await serverClient.apiClient[method](endpoint, payload);
    port.postMessage({ type: 'widget_apply_result', success: true });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    port.postMessage({ type: 'widget_apply_result', success: false, error: errorMsg });
  }
  break;
}
```

**Dismiss:** Side panel removes widget from local message state. No server call needed.

### 14c. CustomReasoningWidget

**File:** `pages/side-panel/src/components/widgets/CustomReasoningWidget.tsx`

Collapsible thinking/progress display for the synthesizer's reasoning process.

**Features:**
- Collapsible section with brain icon
- Streaming text with animated cursor during active reasoning
- Brain icon pulse animation during streaming
- Duration display after completion
- Auto-collapsed by default, user can expand

**Data shape:** `CustomReasoningWidgetSpecV1` schema (from backend `widgets/schemas/custom-reasoning-widget.schema.ts`)

```typescript
interface CustomReasoningWidget {
  type: 'data-custom-reasoning';
  data: {
    text: string;
    isStreaming: boolean;
    startTime?: number;
    endTime?: number;
  };
}
```

### 14d. Widget Types (Shared)

**File:** `chrome-extension/src/background/services/server/widget-types.ts`

Copy Zod schemas from backend and convert to TypeScript interfaces. These types are shared between the background service worker (for widget event routing) and the side panel (for rendering).

```typescript
export type WidgetEvent =
  | HotelMetricsDataWidget
  | SuggestionActionWidget
  | CustomReasoningWidget;

export type WidgetType =
  | 'data-hotel-metrics-data'
  | 'data-suggestion-action'
  | 'data-custom-reasoning';
```

### 14e. Widget Rendering in MessageBubble

The existing message bubble component is extended to render widgets after the text content:

```tsx
// In MessageBubble or equivalent component
{message.widgets?.map((widget, i) => {
  switch (widget.type) {
    case 'data-hotel-metrics-data':
      return <HotelMetricsWidget key={i} data={widget.data} />;
    case 'data-suggestion-action':
      return <SuggestionActionWidget key={i} data={widget.data} onApply={(apiCall) => {
        portRef.current?.postMessage({ type: 'widget_apply', apiCall });
      }} />;
    case 'data-custom-reasoning':
      return <CustomReasoningWidget key={i} data={widget.data} />;
    default:
      return null;
  }
})}
```

---

## Step 15: Extension — Workflow Prompts (Hardcoded)

Predefined workflow prompts ship with the extension as pre-populated bookmark entries. These are regular prompts — the extension's browser agent executes them like any other task. No backend dependency — no workflow APIs, matching, or tracking.

### 15a. Workflow Prompt Definitions

**File:** `chrome-extension/src/background/services/workflow-prompts.ts`

```typescript
export interface WorkflowPrompt {
  id: string;
  name: string;
  description: string;
  prompt: string;
  category: 'pricing' | 'bookings' | 'content';
  icon: string;
}

export const WORKFLOW_PROMPTS: WorkflowPrompt[] = [
  {
    id: 'ota-price-parity',
    name: 'OTA Price Parity Check',
    description: 'Compare OTA rates with your current pricing',
    prompt: 'Go to Booking.com, Expedia, and Hotels.com and compare their rates for our hotel with our current pricing for the next 7 days. Present a comparison table showing any rate disparities.',
    category: 'pricing',
    icon: 'scale',
  },
  {
    id: 'group-bookings',
    name: 'Group Booking Inquiries',
    description: 'Search for pending group booking requests',
    prompt: 'Search for group booking inquiries on our booking platform and compile a summary of pending requests including dates, group size, and requested rates.',
    category: 'bookings',
    icon: 'users',
  },
  {
    id: 'content-research',
    name: 'Competitor Content Research',
    description: 'Research competitor property descriptions',
    prompt: 'Research what our top 3 competitors are highlighting on their websites and compare with our current property description. Note any unique selling points we should consider adding.',
    category: 'content',
    icon: 'search',
  },
];
```

### 15b. Integration with Favorites/Bookmarks

These prompts integrate with the extension's existing favorites/bookmarks system (`packages/storage/lib/prompt/favorites.ts`). They appear as pre-populated entries that ship with the extension (not user-created). Since the existing `FavoritePrompt` interface only has `{ id, title, content }`, workflow prompts are distinguished by a title prefix convention (e.g., `"[Workflow] OTA Price Parity Check"`) rather than a dedicated flag — no interface change needed.

Implementation:
- On first extension install, seed the favorites store with workflow prompts
- Workflow prompts appear in a separate "Workflows" section in the bookmarks dropdown
- User can edit or delete workflow prompts (they're just bookmarks)
- Selecting a workflow prompt fills the chat input and the user submits it like any other task

---

## Step 16: Server-Side API Key Storage

### Concept

When the server is configured and authenticated, the server becomes the **primary store** for LLM provider API keys. The extension caches keys locally for offline use and performance. When no server is configured, the extension falls back to the current local-only behavior (zero breaking changes).

### Flow

```
Server configured + authenticated:
  Save key → push to server → update local cache
  Extension startup → pull from server → populate local cache
  Server unreachable → use local cache (stale but functional)

No server configured:
  Save key → store locally only (current behavior, unchanged)
```

### Backend Changes

#### New file: `extension-keys.controller.ts`

```typescript
@Controller('ai/extension')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ExtensionKeysController {
  constructor(private readonly extensionKeysService: ExtensionKeysService) {}

  @Post('keys')
  async saveKeys(@Req() req, @Body() body: { providers: Record<string, ProviderConfig> }) {
    await this.extensionKeysService.saveKeys(req.user.id, body.providers);
    return { success: true };
  }

  @Get('keys')
  async getKeys(@Req() req) {
    const providers = await this.extensionKeysService.getKeys(req.user.id);
    return { providers };
  }
}
```

#### New file: `extension-keys.service.ts`

- `saveKeys(userId, providers)` — encrypts API key values at rest (AES-256 with server-managed key), stores in DB keyed by userId
- `getKeys(userId)` — decrypts and returns provider configs
- Schema: `extension_keys` table with columns `(id, user_id, provider_data_encrypted, updated_at)`
- Provider data stored as encrypted JSON blob (the full `Record<string, ProviderConfig>`)

#### Register in `ai.module.ts`

Add `ExtensionKeysController` and `ExtensionKeysService` to the module.

### Extension Changes

#### File: `packages/storage/lib/settings/serverSettings.ts`

Add `keySyncEnabled` flag:

```typescript
export interface ServerSettingsConfig {
  serverUrl: string;
  accessToken: string;
  userId: string;
  tokenExpiresAt: number;
  keySyncEnabled: boolean;  // NEW
}

export const DEFAULT_SERVER_SETTINGS: ServerSettingsConfig = {
  // ... existing defaults ...
  keySyncEnabled: false,
};
```

#### File: `chrome-extension/src/background/services/server/serverClient.ts`

Add two methods:

```typescript
async pushKeys(providers: Record<string, ProviderConfig>): Promise<void> {
  await this.apiClient.post('/ai/extension/keys', { providers });
}

async pullKeys(): Promise<Record<string, ProviderConfig>> {
  const { data } = await this.apiClient.get<{ providers: Record<string, ProviderConfig> }>(
    '/ai/extension/keys',
  );
  return data.providers;
}
```

#### File: `chrome-extension/src/background/index.ts`

On successful login (or server client init with valid token), if `keySyncEnabled`:

```typescript
// After login or on init with valid token:
if (keySyncEnabled && serverClient) {
  try {
    const serverKeys = await serverClient.pullKeys();
    if (Object.keys(serverKeys).length > 0) {
      // Server is source of truth — overwrite local
      for (const [id, config] of Object.entries(serverKeys)) {
        await llmProviderStore.setProvider(id, config);
      }
    }
  } catch (error) {
    logger.warn('Failed to pull keys from server, using local cache');
  }
}
```

On local key save (when `keySyncEnabled`), push to server:

```typescript
// In the save-key message handler, after llmProviderStore.setProvider():
if (keySyncEnabled && serverClient && await serverClient.isAuthenticated()) {
  const allProviders = await llmProviderStore.getAllProviders();
  serverClient.pushKeys(allProviders).catch(error => {
    logger.warn('Failed to sync keys to server:', error);
  });
}
```

#### File: `pages/options/src/components/ServerSettings.tsx`

When server is connected + authenticated, show a "Sync API keys to server" toggle. This sets `keySyncEnabled` in `serverSettingsStore`.

Add an "Import keys from server" button that triggers a one-time pull (useful for setting up a new device).

### Security

- Keys encrypted at rest on server (AES-256, server-managed encryption key)
- Transport security via HTTPS + JWT Bearer auth (existing)
- Keys only sent when user explicitly enables sync
- Local cache persists on logout for offline use (existing behavior)
- Server deletion: handled via V2 enhancement (see V2 table below)

---

## Backend Cleanup

### Files to DELETE (~4,200 lines)

All paths relative to `src/lib/ai/`.

**Browser-agent execution (~3,500 lines):**

| File | Lines | Why |
|------|-------|-----|
| `services/browser-agent.service.ts` | 566 | Extension Navigator replaces this |
| `services/browser-agent.prompt.ts` | 444 | Prompts for deleted service |
| `services/browser-session-store.service.ts` | 302 | Extension manages sessions locally |
| `services/browser-session-handler.service.ts` | 937 | Extension manages sessions locally |
| `utils/browser-tools.ts` | ~400 | 19 tool definitions for deleted service |
| `utils/browser-message-pipeline.ts` | ~600 | Message preprocessing for deleted service |
| `utils/browser-message-pipeline.spec.ts` | ~200 | Tests for deleted utility |
| `utils/browser-loop-guard.ts` | ~30 | Loop detection for deleted service |
| `utils/create-tool-validating-stream.ts` | ~100 | Tool validation for deleted service |
| `utils/action-sensitivity-classifier.ts` | ~80 | Risk classification for deleted service |

**Workflow infrastructure (~700 lines):**

| File | Lines | Why |
|------|-------|-----|
| `workflows/workflow.service.ts` | ~200 | Extension uses hardcoded prompts, no tracking API needed |
| `workflows/workflow-registry.service.ts` | ~150 | Extension uses hardcoded prompts, no matching needed |
| `workflows/ota-price-parity.workflow.ts` | ~100 | Replaced by hardcoded extension prompt (see Step 15) |
| `workflows/group-bookings.workflow.ts` | ~100 | Replaced by hardcoded extension prompt (see Step 15) |
| `workflows/content-research.workflow.ts` | ~100 | Replaced by hardcoded extension prompt (see Step 15) |
| `entities/workflow-execution.entity.ts` | ~50 | No execution tracking on backend |

### Orchestrator surgery (`chat-orchestrator.service.ts`)

**Remove these methods:**
- `shouldResumeBrowserAgent()` — browser phase detection
- `detectBrowserPhase()` — browser phase detection
- `startBrowserPlanningSession()` — creates browser sessions, calls BrowserAgentService
- `startUserWorkflowSession()` — initiates user workflows via BrowserAgentService
- `startPredefinedWorkflow()` — initiates system workflows via BrowserAgentService
- `saveCompletionInCallback()` — browser task result persistence
- `extractPlanFromMessages()` — extracts approved browser plan

**Remove from `executeOrchestratorPipeline()`:**
- Browser session resume routing
- Browser phase detection branching
- Workflow matching → browser execution routing
- When planner returns `requiresBrowser=true`, return "not supported — use the extension" message instead of routing to BrowserAgentService

**Remove constructor injections:**
- `BrowserAgentService`
- `BrowserSessionStoreService`
- `BrowserSessionHandlerService`
- `WorkflowRegistryService`
- `WorkflowService`

### Module wiring (`ai.module.ts`)

**Remove 5 providers:**
- `BrowserAgentService`
- `BrowserSessionStoreService`
- `BrowserSessionHandlerService`
- `WorkflowService`
- `WorkflowRegistryService`

**Remove controller:**
- `WorkflowController`

---

## Edge Cases

| Scenario | Handling |
|---|---|
| Server escalates mid-stream | `executeDomainQuery()` emits partial text as STEP_OK, returns `'escalated'` to fall through to browser |
| Server down during domain_query | `executeDomainQuery()` catches error, emits STEP_FAIL, returns `'error'` — does NOT fall through to browser |
| Server down during query_hotel_data | ActionBuilder handler catches error, returns ActionResult with error text |
| No server configured | PlannerPrompt uses 2-way template (general/browser), ActionBuilder skips query_hotel_data, executeDomainQuery never called |
| LLM outputs `web_task` instead of `task_type` | Schema accepts both fields, `resolveTaskType()` falls back to web_task boolean |
| Follow-up after domain query | Existing `addFollowUpTask()` triggers new planner classification with SYNTHESIZER messages in context |
| Hotel context cache stale | Acceptable for now — refreshed on serverClient re-init (settings change subscription); add TTL-based refresh later |
| Widget Apply fails (auth expired) | SuggestionActionWidget shows error state, user can retry or dismiss |
| Widget Apply fails (validation) | Show parsed validation error message in widget error state |
| Multi-turn domain query | `executeDomainQuery()` passes conversation history (not just single message) to backend for context continuity |
| Sources from domain query | Extension surfaces data source attribution in the synthesizer message UI |
| User cancels mid-domain-query | `AbortSignal` terminates SSE stream, partial text emitted as STEP_OK, task marked cancelled |
| Concurrent domain queries | New query aborts previous SSE stream via shared AbortController before starting |
| Token expires mid-SSE-stream | Server closes connection with 401, `executeDomainQuery()` catches as error, emits STEP_FAIL with auth-expired message |
| Widget update during streaming | Side panel matches incoming widget by `widgetId` — updates in place if exists, appends if new |
| Rapid widget Apply clicks | Apply button disabled immediately on first click (optimistic UI), re-enabled on error |
| Domain→browser follow-up | Planner messages with TASK_OK state included in conversation history for server context |
| TypeORM entity removal | Backend cleanup must include a database migration dropping the `workflow_execution` table, not just deleting the entity file |

---

## Verification Plan

1. **Build check:** `pnpm type-check` (all workspaces)
2. **General path:** "What's 2+2?" → task_type: "general", done: true → answer in side panel
3. **Domain query:** With server configured, "What's our ADR?" → task_type: "domain_query" → SSE stream → SYNTHESIZER actor in side panel
4. **Browser:** "Go to Booking.com" → task_type: "browser" → navigator loop unchanged
5. **Browser + hotel data:** "Compare Booking.com to our BAR rate" → browser path → navigator calls query_hotel_data mid-task
6. **Escalation:** Server returns escalate → executor falls through to browser
7. **No server:** Server URL empty → only general/browser in prompt
8. **Server down:** executeDomainQuery() catches → escalates to browser with message
9. **Domain query with chart:** "What's our ADR for next week?" → SYNTHESIZER streams text + `data-hotel-metrics-data` widget → Recharts renders in side panel
10. **Suggestion widget:** "Should we raise prices for the weekend?" → SYNTHESIZER streams text + `data-suggestion-action` widget → user clicks Apply → backend API called → prices updated
11. **Suggestion dismiss:** User clicks Dismiss → widget removed from message
12. **Workflow prompt:** User selects OTA parity prompt from bookmarks → browser agent navigates sites and compares pricing
13. **Reasoning display:** Domain query shows `data-custom-reasoning` events as collapsible thinking progress
14. **Multi-turn domain query:** Follow-up "And for next month?" after domain query → conversation history passed to backend → contextual answer

---

## Implementation Hazards

Tricky spots that could cause silent bugs if not handled carefully:

| # | Hazard | Where | Risk | Mitigation |
|---|--------|-------|------|------------|
| H1 | Domain query check ordering | Step 6d, `execute()` | Planner sets `done=true` for domain_query. If `checkTaskCompletion()` runs first, domain queries silently treated as general answers. | Keep domain_query check BEFORE completion check. Add code comment. Consider extracting to `handleDomainQueryIfApplicable()`. |
| H2 | WIDGET_EVENT not in enum | Step 3 vs Step 6e | TypeScript compile error when emitting `ExecutionState.WIDGET_EVENT` | Define in Step 3 alongside SYNTHESIZER actor |
| H3 | SSE multi-line data | Step 10a write / Step 6e parse | `writeSSE()` splits JSON by newlines per SSE spec. Parser must rejoin `data:` lines. | Existing `apiClient.stream()` handles this correctly — do NOT write a custom SSE parser |
| H4 | Conversation history gap | Step 6e filter | Planner-answered general queries excluded from history → server loses context on domain follow-ups | Include PLANNER TASK_OK messages in history filter |
| H5 | Escalation vs error | Step 6e return | Both return `true` — browser loop starts on server crash (bad UX) | Return discriminated result: `'completed' \| 'escalated' \| 'error'` |
| H6 | Widget streaming updates | Step 14c | `isStreaming` must transition false → needs in-place update, but widgets array is append-only | Add `widgetId` field, match-and-update logic in side panel |
| H7 | Browser tool when server down | Step 5 | `query_hotel_data` action registered (server configured) but server unreachable → action fails repeatedly | ActionBuilder handler must catch errors gracefully and return informative ActionResult |
| H8 | TypeORM entity orphan | Backend cleanup | Deleting `workflow-execution.entity.ts` without migration → possible startup error | Add migration to drop table |
| H9 | No concurrent query guard | Step 6 | User sends new query while SSE active → two streams writing to same context | Share AbortController, cancel previous before starting new |

---

## V2 — Future Enhancements

Widgets, workflow prompts, and multi-turn domain queries are all in the main implementation scope above. The following are potential future enhancements beyond this architecture:

| Enhancement | Description |
|---|---|
| Tool approval gates | Sequential user approval before executing suggestion Apply actions (currently auto-executes on user click) |
| Scheduled workflow execution | Recurring execution of workflow prompts on a schedule (e.g., daily OTA parity check) |
| Widget interaction history | Undo/redo for suggestion actions, audit trail of applied changes |
| Offline domain query cache | Cache recent domain query results for offline access or faster repeat queries |
| Delete keys from server | Add a "Delete my keys from server" option in settings with a `DELETE /ai/extension/keys` backend endpoint |
| Widget composition | Multiple widgets in a single synthesizer response rendered as a dashboard layout |
