# Unified Routing Architecture — Full Implementation Plan

## Context

The Autumn platform has two disconnected AI systems: (1) the extension's browser agent for web automation and (2) the backend's synthesizer pipeline for hotel domain Q&A (Planner → ArgRepair → Executor → Synthesizer). Phase 8 unifies them through 3-path routing in the extension's planner, so users can ask hotel data questions, browse the web, or do both through a single chat UI.

**Scope:** Both extension and backend repos in a single pass. All workflows and browser agent services remain untouched.

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
async *streamChat(query: string, conversationId?: string): AsyncGenerator<SSEEvent> {
  yield* this.apiClient.stream('/ai/extension/chat', { query, conversationId });
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

    // General path: planner answered directly
    if (this.checkTaskCompletion(latestPlanOutput)) {
      const finalMessage = this.context.finalAnswer || this.context.taskId;
      this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_OK, finalMessage);
      void analytics.trackTaskComplete(this.context.taskId);
      return;
    }

    // Domain query path: short-circuit before navigator loop
    if (
      latestPlanOutput?.result?.task_type === TaskType.DOMAIN_QUERY &&
      this.serverClient
    ) {
      const escalated = await this.executeDomainQuery();
      if (!escalated) return;
      // Server escalated to browser — fall through to navigator loop
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

**6e. Add executeDomainQuery() method** (new private method):

```typescript
private async executeDomainQuery(): Promise<boolean> {
  const task = this.tasks[this.tasks.length - 1];
  try {
    const stream = this.serverClient!.streamChat(task);
    let fullText = '';

    for await (const event of stream) {
      switch (event.event) {
        case 'chunk':
          fullText += event.data;
          this.context.emitEvent(Actors.SYNTHESIZER, ExecutionState.STEP_STREAMING, fullText);
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
          return true;
        case 'done':
          this.context.finalAnswer = event.data;
          this.context.emitEvent(Actors.SYNTHESIZER, ExecutionState.STEP_OK, event.data);
          this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_OK, event.data);
          void analytics.trackTaskComplete(this.context.taskId);
          return false;
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
    return false;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Domain query failed: ${errorMessage}`);
    this.context.emitEvent(
      Actors.SYNTHESIZER,
      ExecutionState.STEP_FAIL,
      t('exec_domainQuery_fail', [errorMessage]),
    );
    return true;
  }
}
```

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

**8b.** In `handleTaskState`, add a `case 'synthesizer':` block. Insert it after the `case Actors.NAVIGATOR:` block (after line 273), before the `case Actors.VALIDATOR:` block:

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
    @Body() body: { query: string; conversationId?: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const userId = (req as any).user.id;
    this.logger.log(`Extension chat request from user ${userId}: "${body.query.slice(0, 80)}"`);

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(': ping\n\n');

    try {
      await this.chatOrchestrator.handleExtensionChat(
        body.query,
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

**10b. `handleExtensionChat()`** — Streaming SSE for domain queries:

```typescript
async handleExtensionChat(
  query: string,
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

  const messages = [{ role: 'user', content: query }];
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

    // Phase 3: Stream synthesizer response
    const synthResult = await this.synthesizer.synthesizeForExtension(
      messages, queryResults, context,
      (chunk: string) => this.writeSSE(res, 'chunk', chunk),
    );

    // Send sources and done
    const sources = queryResults
      .filter((q: any) => q.ok)
      .map((q: any) => q.tool);
    this.writeSSE(res, 'sources', JSON.stringify(sources));
    this.writeSSE(res, 'done', synthResult);

    // Save to chat history
    if (conversationId) {
      try {
        await this.chatHistoryService.saveMessages(userId, conversationId, query, synthResult);
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
      model: openai('gpt-4o'),
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
      name: hotelContext.hotelName || 'Unknown',
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

Add `synthesizeForExtension()` method:

```typescript
async synthesizeForExtension(
  messages: Array<{ role: string; content: string }>,
  queryResults: ExecutedQuery[],
  context: RequestContext,
  onChunk: (text: string) => void,
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

    // Use read-only tools only (no suggestion tools that need UIMessageStreamWriter)
    const tools = {
      getBookingCurve: getBookingCurveTool({
        userId: context.userId,
        usersService: this.usersService,
        requestId: context.requestId,
      }),
      getPerformanceSummary: getPerformanceSummaryTool({
        userId: context.userId,
        usersService: this.usersService,
        requestId: context.requestId,
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
      onChunk(part);
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

Add `streamText` and `stepCountIs` to imports at top (they may already be imported via `ai` package):

```typescript
import { streamText, stepCountIs, type UIMessageStreamWriter } from 'ai';
```

---

## Step 12: Backend — Module Wiring

### File: `src/modules/ai/ai.module.ts`

Add import and register controller:

```typescript
import { ExtensionController } from './controllers/extension.controller';

// In @Module:
controllers: [AiController, WorkflowController, ExtensionController],
```

No other changes — all existing services, workflows, and entities remain.

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

## Files NOT Modified (Explicitly Kept)

| File/Directory | Reason |
|---|---|
| `src/lib/ai/workflows/*` | Workflows stay intact per user request |
| `src/lib/ai/services/browser-agent.service.ts` | Browser agent not removed in Phase 8 |
| `src/lib/ai/services/browser-session-*.ts` | Browser sessions not removed in Phase 8 |
| All existing API endpoints (`/ai/chat`, etc.) | No changes to existing functionality |
| `WorkflowService`, `WorkflowRegistryService` | Remain in module providers |
| `WorkflowController` | Remains in module controllers |

---

## Edge Cases

| Scenario | Handling |
|---|---|
| Server escalates mid-stream | `executeDomainQuery()` emits partial text as STEP_OK, returns `true` to fall through to browser |
| Server down during domain_query | `executeDomainQuery()` catches error, emits STEP_FAIL, escalates to browser |
| Server down during query_hotel_data | ActionBuilder handler catches error, returns ActionResult with error text |
| No server configured | PlannerPrompt uses 2-way template (general/browser), ActionBuilder skips query_hotel_data, executeDomainQuery never called |
| LLM outputs `web_task` instead of `task_type` | Schema accepts both fields, `resolveTaskType()` falls back to web_task boolean |
| Follow-up after domain query | Existing `addFollowUpTask()` triggers new planner classification with SYNTHESIZER messages in context |
| Hotel context cache stale | Re-fetched on serverClient re-init (settings change subscription) |

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

---

## V2 — Full Widget Parity Evolution

V1 (Phase 8) delivers text-only domain query responses. The extension receives streaming text chunks via raw SSE events and uses read-only synthesizer tools (`getBookingCurve`, `getPerformanceSummary`). V2 extends this to achieve feature parity with the web app's chat interface — interactive suggestion widgets, data visualization, and actionable controls — all through the same SSE transport.

### SSE Event Format (Extensible, Non-Breaking)

**V1 events (unchanged in V2):**

| Event | Payload | Purpose |
|-------|---------|---------|
| `chunk` | text delta (string) | Streaming synthesizer text |
| `sources` | JSON array of tool names | Data source attribution |
| `done` | full synthesized text (string) | Stream completion signal |
| `escalate` | `{ reason: string, context?: string }` | Browser fallback signal |
| `error` | error message (string) | Error termination |

**V2 events (added alongside V1):**

| Event | Payload | Purpose |
|-------|---------|---------|
| `tool-call` | `{ toolCallId: string, toolName: string, args: object }` | Synthesizer invoked a widget tool |
| `tool-result` | `{ toolCallId: string, result: object }` | Tool execution result |
| `widget` | Widget-specific schema (see below) | Rendered widget data for side panel |

V1 extensions ignore unknown event types, so they work unchanged against a V2 backend (graceful degradation).

### Widget Types

Each widget maps to a synthesizer suggestion tool:

| Widget | Tool | Description |
|--------|------|-------------|
| Floor/Ceiling | `suggestUpdateFloorCeiling` | Rate boundary adjustment |
| Seasonal Settings | `suggestUpdateSeasonalSettings` | Seasonal pricing configuration |
| Room Type Pricing | `suggestRoomTypePriceOverride` | Room type price offset |
| Support Ticket | `suggestOpenSupportTicket` | Open a support request |

### Backend Changes for V2

1. **`synthesizeForExtension()`** adds the suggestion tools listed above. These tools need a writer adapter that emits `tool-call` / `tool-result` / `widget` SSE events instead of writing to the web app's `UIMessageStreamWriter`
2. Add `onToolCall` and `onToolResult` callbacks to the streaming pipeline that translate tool invocations into SSE events
3. No changes to endpoint URLs, pipeline orchestration (`plan → repair → execute → synthesize`), or existing V1 SSE events

### Extension Changes for V2

1. **Side panel** adds React components for each widget type — rendered inline with synthesizer text messages
2. **SSE parser** in the extension handles the new event types (`tool-call`, `tool-result`, `widget`)
3. **`SYNTHESIZER` actor** rendering logic extended to display widget components alongside text content

### Why This Is Additive

- Same endpoint URLs (`/ai/extension/chat`, `/ai/extension/query`, `/ai/extension/context`)
- Same SSE transport — no protocol changes
- V1 events remain byte-identical — V2 adds new event types alongside them
- Pipeline logic is identical; only the synthesizer tool set and transport event types expand
- Backward-compatible: V1 extensions silently ignore V2-only events
