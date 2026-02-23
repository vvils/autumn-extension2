import type { ProviderConfig, ModelConfig } from '@extension/storage';
import { ProviderTypeEnum } from '@extension/storage';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

const maxTokens = 1024 * 4;

function isOpenAIReasoningModel(modelName: string): boolean {
  let modelNameWithoutProvider = modelName;
  if (modelName.startsWith('openai/')) {
    modelNameWithoutProvider = modelName.substring(7);
  }
  return (
    modelNameWithoutProvider.startsWith('o') ||
    (modelNameWithoutProvider.startsWith('gpt-5') && !modelNameWithoutProvider.startsWith('gpt-5-chat'))
  );
}

function createOpenAIChatModel(
  providerConfig: ProviderConfig,
  modelConfig: ModelConfig,
  extraFetchOptions: { headers?: Record<string, string> } | undefined,
): BaseChatModel {
  const args: {
    model: string;
    apiKey?: string;
    configuration?: Record<string, unknown>;
    modelKwargs?: {
      max_completion_tokens: number;
      reasoning_effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high';
    };
    topP?: number;
    temperature?: number;
    maxTokens?: number;
  } = {
    model: modelConfig.modelName,
    apiKey: providerConfig.apiKey,
  };

  const configuration: Record<string, unknown> = {};
  if (providerConfig.baseUrl) {
    configuration.baseURL = providerConfig.baseUrl;
  }
  if (extraFetchOptions?.headers) {
    configuration.defaultHeaders = extraFetchOptions.headers;
  }
  args.configuration = configuration;

  if (providerConfig.apiKey) {
    args.apiKey = providerConfig.apiKey;
  }

  if (isOpenAIReasoningModel(modelConfig.modelName)) {
    args.modelKwargs = {
      max_completion_tokens: maxTokens,
    };

    if (modelConfig.reasoningEffort) {
      if (modelConfig.modelName.includes('gpt-5.1') && modelConfig.reasoningEffort === 'minimal') {
        args.modelKwargs.reasoning_effort = 'none';
      } else {
        args.modelKwargs.reasoning_effort = modelConfig.reasoningEffort;
      }
    }
  } else {
    args.topP = (modelConfig.parameters?.topP ?? 0.1) as number;
    args.temperature = (modelConfig.parameters?.temperature ?? 0.1) as number;
    args.maxTokens = maxTokens;
  }
  return new ChatOpenAI(args);
}

export function createChatModel(providerConfig: ProviderConfig, modelConfig: ModelConfig): BaseChatModel {
  const temperature = (modelConfig.parameters?.temperature ?? 0.1) as number;

  switch (modelConfig.provider) {
    case ProviderTypeEnum.OpenAI: {
      return createOpenAIChatModel(providerConfig, modelConfig, undefined);
    }
    case ProviderTypeEnum.Anthropic: {
      const args = {
        model: modelConfig.modelName,
        apiKey: providerConfig.apiKey,
        maxTokens,
        temperature,
        clientOptions: {},
      };
      const model = new ChatAnthropic(args);
      // Anthropic API rejects top_p alongside temperature; langchain defaults topP to -1
      // for models not in its allowlist. Override to undefined so it's omitted from requests.
      model.topP = undefined as unknown as number;
      return model;
    }
    default: {
      return createOpenAIChatModel(providerConfig, modelConfig, undefined);
    }
  }
}
