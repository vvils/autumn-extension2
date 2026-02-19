import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { type ActionResult, AgentContext, type AgentOptions, type AgentOutput } from './types';
import { NavigatorAgent, NavigatorActionRegistry } from './agents/navigator';
import { PlannerAgent, type PlannerOutput, TaskType } from './agents/planner';
import { NavigatorPrompt } from './prompts/navigator';
import { PlannerPrompt } from './prompts/planner';
import { createLogger } from '@src/background/log';
import MessageManager from './messages/service';
import type BrowserContext from '../browser/context';
import { ActionBuilder } from './actions/builder';
import { EventManager } from './event/manager';
import { Actors, type EventCallback, EventType, ExecutionState } from './event/types';
import {
  ChatModelAuthError,
  ChatModelBadRequestError,
  ChatModelForbiddenError,
  ExtensionConflictError,
  RequestCancelledError,
  MaxStepsReachedError,
  MaxFailuresReachedError,
} from './agents/errors';
import { URLNotAllowedError } from '../browser/views';
import { chatHistoryStore } from '@extension/storage/lib/chat';
import type { AgentStepHistory } from './history';
import type { GeneralSettingsConfig } from '@extension/storage';
import type { ServerClient } from '../services/server';
import { analytics } from '../services/analytics';

const logger = createLogger('Executor');

export interface ExecutorExtraArgs {
  plannerLLM?: BaseChatModel;
  extractorLLM?: BaseChatModel;
  agentOptions?: Partial<AgentOptions>;
  generalSettings?: GeneralSettingsConfig;
  serverClient?: ServerClient | null;
  hotelCapabilities?: string;
  connectedIntegrations?: string;
}

export class Executor {
  private readonly navigator: NavigatorAgent;
  private readonly planner: PlannerAgent;
  private readonly context: AgentContext;
  private readonly plannerPrompt: PlannerPrompt;
  private readonly navigatorPrompt: NavigatorPrompt;
  private readonly serverClient: ServerClient | null;
  private readonly generalSettings: GeneralSettingsConfig | undefined;
  private tasks: string[] = [];
  private conversationMessages: Array<{ role: string; content: string }> = [];
  private domainQueryAbortController?: AbortController;
  constructor(
    task: string,
    taskId: string,
    browserContext: BrowserContext,
    navigatorLLM: BaseChatModel,
    extraArgs?: Partial<ExecutorExtraArgs>,
  ) {
    const messageManager = new MessageManager();

    const plannerLLM = extraArgs?.plannerLLM ?? navigatorLLM;
    const extractorLLM = extraArgs?.extractorLLM ?? navigatorLLM;
    const eventManager = new EventManager();
    const context = new AgentContext(
      taskId,
      browserContext,
      messageManager,
      eventManager,
      extraArgs?.agentOptions ?? {},
    );

    this.serverClient = extraArgs?.serverClient ?? null;
    this.generalSettings = extraArgs?.generalSettings;
    this.tasks.push(task);
    this.navigatorPrompt = new NavigatorPrompt(context.options.maxActionsPerStep);
    console.log('[Planner] connectedIntegrations:', extraArgs?.connectedIntegrations);
    this.plannerPrompt = new PlannerPrompt(
      !!this.serverClient,
      extraArgs?.hotelCapabilities,
      extraArgs?.connectedIntegrations,
    );

    const actionBuilder = new ActionBuilder(context, extractorLLM, this.serverClient, extraArgs?.connectedIntegrations);
    const navigatorActionRegistry = new NavigatorActionRegistry(actionBuilder.buildDefaultActions());

    // Initialize agents with their respective prompts
    this.navigator = new NavigatorAgent(navigatorActionRegistry, {
      chatLLM: navigatorLLM,
      context: context,
      prompt: this.navigatorPrompt,
    });

    this.planner = new PlannerAgent({
      chatLLM: plannerLLM,
      context: context,
      prompt: this.plannerPrompt,
    });

    this.context = context;
    // Initialize message history
    this.context.messageManager.initTaskMessages(this.navigatorPrompt.getSystemMessage(), task);
  }

  subscribeExecutionEvents(callback: EventCallback): void {
    this.context.eventManager.subscribe(EventType.EXECUTION, callback);
  }

  clearExecutionEvents(): void {
    // Clear all execution event listeners
    this.context.eventManager.clearSubscribers(EventType.EXECUTION);
  }

  addFollowUpTask(task: string): void {
    this.tasks.push(task);
    this.context.messageManager.addNewTask(task);

    // need to reset previous action results that are not included in memory
    this.context.actionResults = this.context.actionResults.filter(result => result.includeInMemory);
  }

  /**
   * Check if task is complete based on planner output and handle completion
   */
  private checkTaskCompletion(planOutput: AgentOutput<PlannerOutput> | null): boolean {
    if (planOutput?.result?.done) {
      logger.info('✅ Planner confirms task completion');
      if (planOutput.result.final_answer) {
        this.context.finalAnswer = planOutput.result.final_answer;
      }
      return true;
    }
    return false;
  }

  /**
   * Execute the task
   *
   * @returns {Promise<void>}
   */
  async execute(): Promise<void> {
    logger.info(`🚀 Executing task: ${this.tasks[this.tasks.length - 1]}`);
    const context = this.context;
    context.nSteps = 0;
    const allowedMaxSteps = this.context.options.maxSteps;
    const task = this.tasks[this.tasks.length - 1];

    try {
      this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_START, this.context.taskId);
      void analytics.trackTaskStart(this.context.taskId);

      // Phase 1: Run initial planner to classify the task
      let latestPlanOutput = await this.runPlanner();

      // Phase 2: Domain query check — MUST run BEFORE checkTaskCompletion (Hazard H1)
      // The planner sets done=true for domain_query tasks so the system routes to
      // the synthesizer. If checkTaskCompletion ran first, domain queries would be
      // silently treated as general answers.
      if (
        this.serverClient &&
        latestPlanOutput?.result?.task_type === TaskType.DOMAIN_QUERY &&
        latestPlanOutput.result.done
      ) {
        const domainResult = await this.executeDomainQuery(task);
        if (domainResult === 'completed') {
          this.appendConversationHistory(task, this.context.finalAnswer ?? '');
          void analytics.trackTaskComplete(this.context.taskId);
          return;
        }
        if (domainResult === 'error') {
          this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_FAIL, 'Domain query failed: Stream failed');
          void analytics.trackTaskFailed(this.context.taskId, analytics.categorizeError('domain_query_error'));
          return;
        }
        // domainResult === 'escalated': fall through to browser loop
        // Re-run planner for browser planning since escalation invalidated done=true (Hazard H2)
        latestPlanOutput = await this.runPlanner();
      }

      // Phase 3: General completion check
      if (this.checkTaskCompletion(latestPlanOutput)) {
        const finalMessage = this.context.finalAnswer || this.context.taskId;
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_OK, finalMessage);
        this.appendConversationHistory(task, this.context.finalAnswer ?? '');
        void analytics.trackTaskComplete(this.context.taskId);
        return;
      }

      // Phase 4: Browser step loop
      let step = 0;
      let navigatorDone = false;

      for (step = 0; step < allowedMaxSteps; step++) {
        context.stepInfo = {
          stepNumber: context.nSteps,
          maxSteps: context.options.maxSteps,
        };

        logger.info(`🔄 Step ${step + 1} / ${allowedMaxSteps}`);
        if (await this.shouldStop()) {
          break;
        }

        // Run planner periodically (skip step 0 — already ran above)
        if (step > 0 && this.planner && (context.nSteps % context.options.planningInterval === 0 || navigatorDone)) {
          navigatorDone = false;
          latestPlanOutput = await this.runPlanner();

          if (this.checkTaskCompletion(latestPlanOutput)) {
            break;
          }
        }

        navigatorDone = await this.navigate();

        if (navigatorDone) {
          logger.info('🔄 Navigator indicates completion - will be validated by next planner run');
        }
      }

      // Phase 5: Post-loop status
      const isCompleted = latestPlanOutput?.result?.done === true;

      if (isCompleted) {
        const finalMessage = this.context.finalAnswer || this.context.taskId;
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_OK, finalMessage);
        this.appendConversationHistory(task, this.context.finalAnswer ?? '');
        void analytics.trackTaskComplete(this.context.taskId);
      } else if (step >= allowedMaxSteps) {
        logger.error('❌ Task failed: Max steps reached');
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_FAIL, 'Max steps reached');
        const maxStepsError = new MaxStepsReachedError('Max steps reached');
        const errorCategory = analytics.categorizeError(maxStepsError);
        void analytics.trackTaskFailed(this.context.taskId, errorCategory);
      } else if (this.context.stopped) {
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_CANCEL, 'Task cancelled');
        void analytics.trackTaskCancelled(this.context.taskId);
      } else {
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_PAUSE, 'Task paused');
      }
    } catch (error) {
      if (error instanceof RequestCancelledError) {
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_CANCEL, 'Task cancelled');
        void analytics.trackTaskCancelled(this.context.taskId);
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_FAIL, `Task failed: \n\n${errorMessage}`);
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

  private async executeDomainQuery(task: string): Promise<'completed' | 'escalated' | 'error'> {
    const abortController = new AbortController();
    this.domainQueryAbortController = abortController;

    const onContextAbort = () => abortController.abort();
    this.context.controller.signal.addEventListener('abort', onContextAbort);

    try {
      const history = [...this.conversationMessages, { role: 'user', content: task }];
      let fullText = '';
      logger.info('Starting domain query');

      for await (const event of this.serverClient!.streamChat(history, undefined, abortController.signal)) {
        if (this.context.stopped) {
          abortController.abort();
          break;
        }

        switch (event.event) {
          case 'chunk':
            fullText += event.data;
            logger.info('Domain query chunk', `+${event.data.length} chars (total: ${fullText.length})`);
            this.context.emitEvent(Actors.SYNTHESIZER, ExecutionState.STEP_STREAMING, fullText);
            break;

          case 'widget':
            logger.info('Domain query widget', event.data);
            this.context.emitEvent(Actors.SYNTHESIZER, ExecutionState.WIDGET_EVENT, event.data);
            break;

          case 'escalate':
            if (fullText) {
              this.context.emitEvent(Actors.SYNTHESIZER, ExecutionState.STEP_OK, fullText);
            }
            logger.info('Domain query escalated to browser');
            return 'escalated';

          case 'error':
            throw new Error(event.data);

          case 'done':
            logger.info('Domain query completed', `${fullText.length} chars`);
            this.context.finalAnswer = fullText;
            this.context.emitEvent(Actors.SYNTHESIZER, ExecutionState.STEP_OK, fullText);
            this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_OK, fullText);
            return 'completed';
        }
      }

      // Stream ended without explicit done — treat accumulated text as completed
      if (fullText) {
        this.context.finalAnswer = fullText;
        this.context.emitEvent(Actors.SYNTHESIZER, ExecutionState.STEP_OK, fullText);
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_OK, fullText);
        return 'completed';
      }

      return 'error';
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Domain query failed: ${errorMsg}`);
      this.context.emitEvent(Actors.SYNTHESIZER, ExecutionState.STEP_FAIL, errorMsg);
      return 'error';
    } finally {
      this.context.controller.signal.removeEventListener('abort', onContextAbort);
      this.domainQueryAbortController = undefined;
    }
  }

  private appendConversationHistory(userMessage: string, assistantMessage: string): void {
    this.conversationMessages.push({ role: 'user', content: userMessage });
    if (assistantMessage) {
      this.conversationMessages.push({ role: 'assistant', content: assistantMessage });
    }
  }

  /**
   * Helper method to run planner and store its output
   */
  private async runPlanner(): Promise<AgentOutput<PlannerOutput> | null> {
    const context = this.context;
    try {
      // Add current browser state to memory
      let positionForPlan = 0;
      if (this.tasks.length > 1 || this.context.nSteps > 0) {
        await this.navigator.addStateMessageToMemory();
        positionForPlan = this.context.messageManager.length() - 1;
      } else {
        positionForPlan = this.context.messageManager.length();
      }

      // Execute planner
      const planOutput = await this.planner.execute();
      if (planOutput.result) {
        this.context.messageManager.addPlan(JSON.stringify(planOutput.result), positionForPlan);
      }
      return planOutput;
    } catch (error) {
      logger.error(`Failed to execute planner: ${error}`);
      if (
        error instanceof ChatModelAuthError ||
        error instanceof ChatModelBadRequestError ||
        error instanceof ChatModelForbiddenError ||
        error instanceof URLNotAllowedError ||
        error instanceof RequestCancelledError ||
        error instanceof ExtensionConflictError
      ) {
        throw error;
      }
      context.consecutiveFailures++;
      logger.error(`Failed to execute planner: ${error}`);
      if (context.consecutiveFailures >= context.options.maxFailures) {
        throw new MaxFailuresReachedError('Max failures reached');
      }
      return null;
    }
  }

  private async navigate(): Promise<boolean> {
    const context = this.context;
    try {
      // Get and execute navigation action
      // check if the task is paused or stopped
      if (context.paused || context.stopped) {
        return false;
      }
      const navOutput = await this.navigator.execute();
      // check if the task is paused or stopped
      if (context.paused || context.stopped) {
        return false;
      }
      context.nSteps++;
      if (navOutput.error) {
        throw new Error(navOutput.error);
      }
      context.consecutiveFailures = 0;
      if (navOutput.result?.done) {
        return true;
      }
    } catch (error) {
      logger.error(`Failed to execute step: ${error}`);
      if (
        error instanceof ChatModelAuthError ||
        error instanceof ChatModelBadRequestError ||
        error instanceof ChatModelForbiddenError ||
        error instanceof URLNotAllowedError ||
        error instanceof RequestCancelledError ||
        error instanceof ExtensionConflictError
      ) {
        throw error;
      }
      context.consecutiveFailures++;
      logger.error(`Failed to execute step: ${error}`);
      if (context.consecutiveFailures >= context.options.maxFailures) {
        throw new MaxFailuresReachedError('Max failures reached');
      }
    }
    return false;
  }

  private async shouldStop(): Promise<boolean> {
    if (this.context.stopped) {
      logger.info('Agent stopped');
      return true;
    }

    while (this.context.paused) {
      await new Promise(resolve => setTimeout(resolve, 200));
      if (this.context.stopped) {
        return true;
      }
    }

    if (this.context.consecutiveFailures >= this.context.options.maxFailures) {
      logger.error(`Stopping due to ${this.context.options.maxFailures} consecutive failures`);
      return true;
    }

    return false;
  }

  async cancel(): Promise<void> {
    this.context.stop();
  }

  async resume(): Promise<void> {
    this.context.resume();
  }

  async pause(): Promise<void> {
    this.context.pause();
  }

  resolveUserInput(response: string): void {
    this.context.resolveUserInput(response);
  }

  async cleanup(): Promise<void> {
    try {
      await this.context.browserContext.cleanup();
    } catch (error) {
      logger.error(`Failed to cleanup browser context: ${error}`);
    }
  }

  async getCurrentTaskId(): Promise<string> {
    return this.context.taskId;
  }

  /**
   * Replays a saved history of actions with error handling and retry logic.
   *
   * @param history - The history to replay
   * @param maxRetries - Maximum number of retries per action
   * @param skipFailures - Whether to skip failed actions or stop execution
   * @param delayBetweenActions - Delay between actions in seconds
   * @returns List of action results
   */
  async replayHistory(
    sessionId: string,
    maxRetries = 3,
    skipFailures = true,
    delayBetweenActions = 2.0,
  ): Promise<ActionResult[]> {
    const results: ActionResult[] = [];
    const replayLogger = createLogger('Executor:replayHistory');

    logger.info('replay task', this.tasks[0]);

    try {
      const historyFromStorage = await chatHistoryStore.loadAgentStepHistory(sessionId);
      if (!historyFromStorage) {
        throw new Error('History not found');
      }

      const history = JSON.parse(historyFromStorage.history) as AgentStepHistory;
      if (history.history.length === 0) {
        throw new Error('History is empty');
      }
      logger.debug(`🔄 Replaying history: ${JSON.stringify(history, null, 2)}`);
      this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_START, this.context.taskId);

      for (let i = 0; i < history.history.length; i++) {
        const historyItem = history.history[i];

        // Check if execution should stop
        if (this.context.stopped) {
          replayLogger.info('Replay stopped by user');
          break;
        }

        // Execute the history step with enhanced method that handles all the logic
        const stepResults = await this.navigator.executeHistoryStep(
          historyItem,
          i,
          history.history.length,
          maxRetries,
          delayBetweenActions * 1000,
          skipFailures,
        );

        results.push(...stepResults);

        // If stopped during execution, break the loop
        if (this.context.stopped) {
          break;
        }
      }

      if (this.context.stopped) {
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_CANCEL, 'Replay cancelled');
      } else {
        this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_OK, 'Replay completed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      replayLogger.error(`Replay failed: ${errorMessage}`);
      this.context.emitEvent(Actors.SYSTEM, ExecutionState.TASK_FAIL, `Replay failed: \n\n${errorMessage}`);
    }

    return results;
  }
}
