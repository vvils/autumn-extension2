import { BaseAgent, type BaseAgentOptions, type ExtraAgentOptions } from './base';
import { createLogger } from '@src/background/log';
import { z } from 'zod';
import type { AgentOutput } from '../types';

import { Actors, ExecutionState } from '../event/types';
import {
  ChatModelAuthError,
  ChatModelBadRequestError,
  ChatModelForbiddenError,
  isAbortedError,
  isAuthenticationError,
  isBadRequestError,
  isForbiddenError,
  LLM_FORBIDDEN_ERROR_MESSAGE,
  RequestCancelledError,
} from './errors';
import { filterExternalContent } from '../messages/utils';
const logger = createLogger('PlannerAgent');

export enum TaskType {
  GENERAL = 'general',
  DOMAIN_QUERY = 'domain_query',
  BROWSER = 'browser',
}

function resolveTaskType(taskType?: string, webTask?: boolean | string): TaskType {
  if (taskType) {
    const lower = taskType
      .trim()
      .toLowerCase()
      .replace(/[^a-z_]/g, '');
    if (['general', 'chat', 'direct', 'answer'].includes(lower)) return TaskType.GENERAL;
    if (['domain_query', 'domainquery', 'domain', 'query', 'hotel', 'data'].includes(lower))
      return TaskType.DOMAIN_QUERY;
    if (['browser', 'web', 'browse', 'navigate'].includes(lower)) return TaskType.BROWSER;
  }
  if (webTask === true || webTask === 'true') return TaskType.BROWSER;
  if (webTask === false || webTask === 'false') return TaskType.GENERAL;
  return TaskType.BROWSER;
}

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
  user_facing_summary: z.string().optional().default(''),
  final_answer: z.string(),
  reasoning: z.string(),
  ask_user: z
    .object({
      question: z.string(),
      context: z.string().optional(),
      options: z
        .array(
          z.object({
            label: z.string(),
            value: z.string(),
          }),
        )
        .optional()
        .transform(arr => (arr && arr.length >= 2 ? arr : undefined)),
    })
    .optional(),
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
  task_type: resolveTaskType(data.task_type, data.web_task as boolean | string | undefined),
}));

export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

export class PlannerAgent extends BaseAgent<typeof plannerOutputSchema, PlannerOutput> {
  constructor(options: BaseAgentOptions, extraOptions?: Partial<ExtraAgentOptions>) {
    super(plannerOutputSchema, options, { ...extraOptions, id: 'planner' });
  }

  async execute(): Promise<AgentOutput<PlannerOutput>> {
    try {
      this.context.emitEvent(Actors.PLANNER, ExecutionState.STEP_START, 'Planning...');
      // get all messages from the message manager, state message should be the last one
      const messages = this.context.messageManager.getMessages();
      // Use full message history except the first one
      const plannerMessages = [this.prompt.getSystemMessage(), ...messages.slice(1)];
      this.context.contextLogger?.logAgentContext('Planner', this.context.nSteps, plannerMessages);

      const tLlm = performance.now();
      const modelOutput = await this.invoke(plannerMessages);
      logger.info(`⏱ LLM invoke: ${Math.round(performance.now() - tLlm)}ms`);
      this.context.contextLogger?.logAgentResponse('Planner', this.context.nSteps, modelOutput);
      if (!modelOutput) {
        throw new Error('Failed to validate planner output');
      }

      if (this.lastUsageMetadata) {
        this.context.costTracker.recordUsage(this.modelName, {
          inputTokens: this.lastUsageMetadata.input_tokens,
          outputTokens: this.lastUsageMetadata.output_tokens,
        });
        this.context.emitCostUpdate();
      }

      // clean the model output
      const observation = filterExternalContent(modelOutput.observation);
      const final_answer = filterExternalContent(modelOutput.final_answer);
      const next_steps = filterExternalContent(modelOutput.next_steps);
      const challenges = filterExternalContent(modelOutput.challenges);
      const reasoning = filterExternalContent(modelOutput.reasoning);
      const user_facing_summary = filterExternalContent(modelOutput.user_facing_summary || '');

      const cleanedPlan: PlannerOutput = {
        ...modelOutput,
        observation,
        challenges,
        reasoning,
        final_answer,
        next_steps,
        user_facing_summary,
      };

      const eventMessage = cleanedPlan.done
        ? cleanedPlan.final_answer
        : cleanedPlan.user_facing_summary || cleanedPlan.next_steps;
      await this.context.emitEvent(Actors.PLANNER, ExecutionState.STEP_OK, eventMessage);
      logger.info('Planner output', JSON.stringify(cleanedPlan, null, 2));

      return {
        id: this.id,
        result: cleanedPlan,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Check if this is an authentication error
      if (isAuthenticationError(error)) {
        throw new ChatModelAuthError(errorMessage, error);
      } else if (isBadRequestError(error)) {
        throw new ChatModelBadRequestError(errorMessage, error);
      } else if (isAbortedError(error)) {
        throw new RequestCancelledError(errorMessage);
      } else if (isForbiddenError(error)) {
        throw new ChatModelForbiddenError(LLM_FORBIDDEN_ERROR_MESSAGE, error);
      }

      logger.error(`Planning failed: ${errorMessage}`);
      this.context.emitEvent(Actors.PLANNER, ExecutionState.STEP_FAIL, `Planning failed: ${errorMessage}`);
      return {
        id: this.id,
        error: errorMessage,
      };
    }
  }
}
