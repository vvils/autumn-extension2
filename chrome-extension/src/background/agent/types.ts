import { z } from 'zod';
import type BrowserContext from '../browser/context';
import { DEFAULT_INCLUDE_ATTRIBUTES } from '../browser/dom/views';
import type { DOMHistoryElement } from '../browser/dom/history/view';
import type MessageManager from './messages/service';
import type { EventManager } from './event/manager';
import { Actors, ExecutionState, AgentEvent } from './event/types';
import { AgentStepHistory } from './history';
import { CostTracker } from './cost';
import { ContextWindowLogger } from './debug/contextLogger';

export interface AgentOptions {
  maxSteps: number;
  maxActionsPerStep: number;
  maxFailures: number;
  retryDelay: number;
  maxInputTokens: number;
  maxErrorLength: number;
  useVision: boolean;
  includeAttributes: string[];
  planningInterval: number;
}

export const DEFAULT_AGENT_OPTIONS: AgentOptions = {
  maxSteps: 100,
  maxActionsPerStep: 10,
  maxFailures: 3,
  retryDelay: 10,
  maxInputTokens: 128000,
  maxErrorLength: 400,
  useVision: false,
  includeAttributes: DEFAULT_INCLUDE_ATTRIBUTES,
  planningInterval: 5,
};

export class AgentContext {
  controller: AbortController;
  taskId: string;
  browserContext: BrowserContext;
  messageManager: MessageManager;
  eventManager: EventManager;
  options: AgentOptions;
  paused: boolean;
  stopped: boolean;
  consecutiveFailures: number;
  nSteps: number;
  stepInfo: AgentStepInfo | null;
  actionResults: ActionResult[];
  stateMessageAdded: boolean;
  history: AgentStepHistory;
  finalAnswer: string | null;
  costTracker: CostTracker;
  contextLogger: ContextWindowLogger | null;
  userInputResolve: ((value: string) => void) | null;

  constructor(
    taskId: string,
    browserContext: BrowserContext,
    messageManager: MessageManager,
    eventManager: EventManager,
    options: Partial<AgentOptions>,
  ) {
    this.controller = new AbortController();
    this.taskId = taskId;
    this.browserContext = browserContext;
    this.messageManager = messageManager;
    this.eventManager = eventManager;
    this.options = { ...DEFAULT_AGENT_OPTIONS, ...options };

    this.paused = false;
    this.stopped = false;
    this.nSteps = 0;
    this.consecutiveFailures = 0;
    this.stepInfo = null;
    this.actionResults = [];
    this.stateMessageAdded = false;
    this.history = new AgentStepHistory();
    this.finalAnswer = null;
    this.costTracker = new CostTracker();
    this.contextLogger = import.meta.env.DEV ? new ContextWindowLogger(taskId) : null;
    this.userInputResolve = null;
  }

  async emitEvent(actor: Actors, state: ExecutionState, eventDetails: string) {
    const event = new AgentEvent(actor, state, {
      taskId: this.taskId,
      step: this.nSteps,
      maxSteps: this.options.maxSteps,
      details: eventDetails,
    });
    await this.eventManager.emit(event);
  }

  async emitCostUpdate() {
    const snapshot = this.costTracker.getSnapshot();
    await this.emitEvent(Actors.SYSTEM, ExecutionState.COST_UPDATE, JSON.stringify(snapshot));
  }

  async pause() {
    this.paused = true;
  }

  async resume() {
    this.paused = false;
  }

  async stop() {
    this.stopped = true;
    setTimeout(() => this.controller.abort(), 300);
  }

  reset(): void {
    this.stopped = false;
    this.paused = false;
    this.controller = new AbortController();
    this.consecutiveFailures = 0;
    this.stateMessageAdded = false;
    this.finalAnswer = null;
    this.contextLogger?.reset();
  }

  waitForUserInput(): Promise<string> {
    if (this.userInputResolve) {
      this.userInputResolve('');
      this.userInputResolve = null;
    }

    return new Promise((resolve, reject) => {
      console.log('[ask_user] waitForUserInput: resolver set');

      // Keep the service worker alive while waiting for user input.
      // A pending Promise alone does not prevent MV3 service worker termination.
      const keepAlive = setInterval(() => {
        /* no-op tick to keep the event loop active */
      }, 20_000);

      const cleanup = () => clearInterval(keepAlive);

      const onAbort = () => {
        cleanup();
        this.userInputResolve = null;
        reject(new Error('Task cancelled while waiting for user input'));
      };

      this.userInputResolve = (value: string) => {
        cleanup();
        resolve(value);
      };

      if (this.controller.signal.aborted) {
        onAbort();
        return;
      }
      this.controller.signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  resolveUserInput(value: string): void {
    console.log('[ask_user] resolveUserInput called', { value, hasResolver: !!this.userInputResolve });
    this.userInputResolve?.(value);
    this.userInputResolve = null;
  }
}

export interface AgentStepInfo {
  stepNumber: number;
  maxSteps: number;
}

export class ActionResult {
  isDone: boolean;
  success: boolean;
  extractedContent: string | null;
  error: string | null;
  includeInMemory: boolean;
  interactedElement: DOMHistoryElement | null;

  constructor(params: Partial<ActionResult> = {}) {
    this.isDone = params.isDone ?? false;
    this.success = params.success ?? false;
    this.interactedElement = params.interactedElement ?? null;
    this.extractedContent = params.extractedContent ?? null;
    this.error = params.error ?? null;
    this.includeInMemory = params.includeInMemory ?? false;
  }
}

export interface StepMetadata {
  stepStartTime: number;
  stepEndTime: number;
  inputTokens: number;
  stepNumber: number;
}

export const agentBrainSchema = z
  .object({
    evaluation_previous_goal: z.string(),
    memory: z.string(),
    next_goal: z.string(),
  })
  .describe('Current state of the agent');

export type AgentBrain = z.infer<typeof agentBrainSchema>;

// Make AgentOutput generic with Zod schema
export interface AgentOutput<T = unknown> {
  /**
   * The unique identifier for the agent
   */
  id: string;

  /**
   * The result of the agent's step
   */
  result?: T;
  /**
   * The error that occurred during the agent's action
   */
  error?: string;
}
