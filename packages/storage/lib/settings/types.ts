export enum AgentNameEnum {
  Planner = 'planner',
  Navigator = 'navigator',
}

export enum ProviderTypeEnum {
  OpenAI = 'openai',
  Anthropic = 'anthropic',
}

export const llmProviderModelNames = {
  [ProviderTypeEnum.OpenAI]: [
    'gpt-5.1',
    'gpt-5',
    'gpt-5-pro',
    'gpt-5-mini',
    'gpt-5-chat-latest',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4o',
  ],
  [ProviderTypeEnum.Anthropic]: [
    'claude-sonnet-4-6',
    'claude-opus-4-6',
    'claude-sonnet-4-5',
    'claude-haiku-4-5',
    'claude-opus-4-1',
  ],
};

export const llmProviderParameters = {
  [ProviderTypeEnum.OpenAI]: {
    [AgentNameEnum.Planner]: {
      temperature: 0.7,
      topP: 0.9,
    },
    [AgentNameEnum.Navigator]: {
      temperature: 0.3,
      topP: 0.85,
    },
  },
  [ProviderTypeEnum.Anthropic]: {
    [AgentNameEnum.Planner]: {
      temperature: 0.3,
      topP: 0.6,
    },
    [AgentNameEnum.Navigator]: {
      temperature: 0.2,
      topP: 0.5,
    },
  },
};
