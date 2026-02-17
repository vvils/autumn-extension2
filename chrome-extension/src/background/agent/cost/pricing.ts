// Last updated: 2026-02-16

export interface ModelPricing {
  inputPricePerMillion: number;
  outputPricePerMillion: number;
}

// Prices in USD per million tokens
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic — Claude 4.5
  'claude-sonnet-4-5': { inputPricePerMillion: 3.0, outputPricePerMillion: 15.0 },
  'claude-sonnet-4-5-20250929': { inputPricePerMillion: 3.0, outputPricePerMillion: 15.0 },
  'claude-haiku-4-5': { inputPricePerMillion: 1.0, outputPricePerMillion: 5.0 },
  'claude-haiku-4-5-20251001': { inputPricePerMillion: 1.0, outputPricePerMillion: 5.0 },
  // Anthropic — Claude 4.6
  'claude-opus-4-6': { inputPricePerMillion: 5.0, outputPricePerMillion: 25.0 },
  'claude-sonnet-4-6': { inputPricePerMillion: 3.0, outputPricePerMillion: 15.0 },
  // Anthropic — Claude 4.1
  'claude-opus-4-1': { inputPricePerMillion: 15.0, outputPricePerMillion: 75.0 },
  'claude-opus-4-1-20250805': { inputPricePerMillion: 15.0, outputPricePerMillion: 75.0 },
  // Anthropic — Claude 4
  'claude-opus-4-20250514': { inputPricePerMillion: 15.0, outputPricePerMillion: 75.0 },
  'claude-sonnet-4-20250514': { inputPricePerMillion: 3.0, outputPricePerMillion: 15.0 },
  // Anthropic — Claude 3.7
  'claude-3-7-sonnet-20250219': { inputPricePerMillion: 3.0, outputPricePerMillion: 15.0 },
  // Anthropic — Claude 3.5
  'claude-3-5-sonnet-20241022': { inputPricePerMillion: 3.0, outputPricePerMillion: 15.0 },
  'claude-3-5-haiku-20241022': { inputPricePerMillion: 0.8, outputPricePerMillion: 4.0 },
  // Anthropic — Claude 3
  'claude-3-opus-20240229': { inputPricePerMillion: 15.0, outputPricePerMillion: 75.0 },
  'claude-3-haiku-20240307': { inputPricePerMillion: 0.25, outputPricePerMillion: 1.25 },

  // OpenAI — GPT-5
  'gpt-5': { inputPricePerMillion: 1.25, outputPricePerMillion: 10.0 },
  'gpt-5-pro': { inputPricePerMillion: 10.0, outputPricePerMillion: 40.0 },
  'gpt-5-mini': { inputPricePerMillion: 0.25, outputPricePerMillion: 2.0 },
  'gpt-5-nano': { inputPricePerMillion: 0.05, outputPricePerMillion: 0.4 },
  // OpenAI — GPT-5.1 / GPT-4.1
  'gpt-5.1': { inputPricePerMillion: 1.25, outputPricePerMillion: 10.0 },
  'gpt-4.1': { inputPricePerMillion: 2.0, outputPricePerMillion: 8.0 },
  'gpt-4.1-mini': { inputPricePerMillion: 0.4, outputPricePerMillion: 1.6 },
  // OpenAI — GPT-4o
  'gpt-4o': { inputPricePerMillion: 2.5, outputPricePerMillion: 10.0 },
  'gpt-4o-mini': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
  // OpenAI — o-series
  o3: { inputPricePerMillion: 2.0, outputPricePerMillion: 8.0 },
  'o3-mini': { inputPricePerMillion: 1.1, outputPricePerMillion: 4.4 },
  'o4-mini': { inputPricePerMillion: 1.1, outputPricePerMillion: 4.4 },

  // Google Gemini
  'gemini-2.5-flash': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
  'gemini-2.5-flash-preview-05-20': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
  'gemini-2.5-pro': { inputPricePerMillion: 1.25, outputPricePerMillion: 10.0 },
  'gemini-2.5-pro-preview-05-06': { inputPricePerMillion: 1.25, outputPricePerMillion: 10.0 },
  'gemini-2.0-flash-001': { inputPricePerMillion: 0.1, outputPricePerMillion: 0.4 },
  'gemini-2.0-flash-lite-preview-02-05': { inputPricePerMillion: 0.075, outputPricePerMillion: 0.3 },

  // DeepSeek
  'deepseek-chat': { inputPricePerMillion: 0.27, outputPricePerMillion: 1.1 },
  'deepseek-reasoner': { inputPricePerMillion: 0.55, outputPricePerMillion: 2.19 },

  // xAI Grok
  'grok-2': { inputPricePerMillion: 2.0, outputPricePerMillion: 10.0 },
  'grok-3': { inputPricePerMillion: 3.0, outputPricePerMillion: 15.0 },
  'grok-3-mini': { inputPricePerMillion: 0.3, outputPricePerMillion: 0.5 },
  'grok-4': { inputPricePerMillion: 3.0, outputPricePerMillion: 15.0 },

  // Groq (hosted models — free tier prices may vary)
  'llama-3.3-70b-versatile': { inputPricePerMillion: 0.59, outputPricePerMillion: 0.79 },
  'llama-3.1-8b-instant': { inputPricePerMillion: 0.05, outputPricePerMillion: 0.08 },

  // Cerebras
  'llama3.1-8b': { inputPricePerMillion: 0.1, outputPricePerMillion: 0.1 },
  'llama3.1-70b': { inputPricePerMillion: 0.6, outputPricePerMillion: 0.6 },
  'llama-3.3-70b': { inputPricePerMillion: 0.6, outputPricePerMillion: 0.6 },
};

const PROVIDER_PREFIXES = ['openai/', 'anthropic/', 'google/', 'deepseek/', 'xai/', 'groq/', 'cerebras/', 'meta/'];

export function findModelPricing(modelName: string): ModelPricing | null {
  if (MODEL_PRICING[modelName]) return MODEL_PRICING[modelName];

  // Strip common provider prefixes (e.g. OpenRouter format "anthropic/claude-sonnet-4")
  let stripped = modelName;
  for (const prefix of PROVIDER_PREFIXES) {
    if (modelName.startsWith(prefix)) {
      stripped = modelName.slice(prefix.length);
      break;
    }
  }
  if (stripped !== modelName && MODEL_PRICING[stripped]) return MODEL_PRICING[stripped];

  // Longest-prefix match for versioned model names (e.g. "gpt-4o-2024-08-06" → "gpt-4o")
  let bestMatch: ModelPricing | null = null;
  let bestLen = 0;
  for (const key of Object.keys(MODEL_PRICING)) {
    if (stripped.startsWith(key) && key.length > bestLen) {
      bestLen = key.length;
      bestMatch = MODEL_PRICING[key];
    }
  }
  return bestMatch;
}
