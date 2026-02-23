import { describe, it, expect } from 'vitest';
import { findModelPricing, MODEL_PRICING } from '../pricing';

describe('findModelPricing', () => {
  it('returns exact match pricing', () => {
    const pricing = findModelPricing('gpt-4o');
    expect(pricing).toEqual(MODEL_PRICING['gpt-4o']);
  });

  it('strips provider prefix for OpenRouter-style names', () => {
    const pricing = findModelPricing('anthropic/claude-sonnet-4-5-20250929');
    expect(pricing).toEqual(MODEL_PRICING['claude-sonnet-4-5-20250929']);
  });

  it('finds pricing for Anthropic base model names without date suffix', () => {
    expect(findModelPricing('claude-sonnet-4-5')).not.toBeNull();
    expect(findModelPricing('claude-haiku-4-5')).not.toBeNull();
    expect(findModelPricing('claude-opus-4-1')).not.toBeNull();
  });

  it('uses longest-prefix match for versioned model names', () => {
    const pricing = findModelPricing('gpt-4o-2024-08-06');
    expect(pricing).toEqual(MODEL_PRICING['gpt-4o']);
  });

  it('strips prefix and uses longest-prefix match together', () => {
    const pricing = findModelPricing('openai/gpt-4o-2024-08-06');
    expect(pricing).toEqual(MODEL_PRICING['gpt-4o']);
  });

  it('returns null for unknown model', () => {
    expect(findModelPricing('totally-unknown-model')).toBeNull();
  });
});
