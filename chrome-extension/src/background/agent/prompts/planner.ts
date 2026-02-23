/* eslint-disable @typescript-eslint/no-unused-vars */
import { BasePrompt } from './base';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { AgentContext } from '@src/background/agent/types';
import { buildPlannerSystemPrompt } from './templates/planner';

export class PlannerPrompt extends BasePrompt {
  constructor(
    private readonly serverAvailable = false,
    private readonly connectedIntegrations?: string,
  ) {
    super();
  }

  getSystemMessage(): SystemMessage {
    return new SystemMessage(
      buildPlannerSystemPrompt({
        serverAvailable: this.serverAvailable,
        connectedIntegrations: this.connectedIntegrations,
      }),
    );
  }

  async getUserMessage(context: AgentContext): Promise<HumanMessage> {
    return new HumanMessage('');
  }
}
