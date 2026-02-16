import { findModelPricing } from './pricing';

export interface CostSnapshot {
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export class CostTracker {
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private estimatedCostUsd = 0;

  recordUsage(modelName: string, usage: TokenUsage): void {
    this.totalInputTokens += usage.inputTokens;
    this.totalOutputTokens += usage.outputTokens;

    const pricing = findModelPricing(modelName);
    if (pricing) {
      this.estimatedCostUsd +=
        (usage.inputTokens * pricing.inputPricePerMillion + usage.outputTokens * pricing.outputPricePerMillion) /
        1_000_000;
    }
  }

  getSnapshot(): CostSnapshot {
    return {
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      estimatedCostUsd: this.estimatedCostUsd,
    };
  }

  reset(): void {
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.estimatedCostUsd = 0;
  }
}
