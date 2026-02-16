import { describe, it, expect } from 'vitest';
import { CostTracker } from '../costTracker';

describe('CostTracker', () => {
  it('starts at zero', () => {
    const tracker = new CostTracker();
    const snapshot = tracker.getSnapshot();
    expect(snapshot.totalInputTokens).toBe(0);
    expect(snapshot.totalOutputTokens).toBe(0);
    expect(snapshot.estimatedCostUsd).toBe(0);
  });

  it('accumulates tokens across multiple calls', () => {
    const tracker = new CostTracker();
    tracker.recordUsage('gpt-4o', { inputTokens: 100, outputTokens: 50 });
    tracker.recordUsage('gpt-4o', { inputTokens: 200, outputTokens: 100 });

    const snapshot = tracker.getSnapshot();
    expect(snapshot.totalInputTokens).toBe(300);
    expect(snapshot.totalOutputTokens).toBe(150);
  });

  it('calculates cost correctly for known models', () => {
    const tracker = new CostTracker();
    // gpt-4o: input $2.5/M, output $10/M
    tracker.recordUsage('gpt-4o', { inputTokens: 1_000_000, outputTokens: 1_000_000 });

    const snapshot = tracker.getSnapshot();
    expect(snapshot.estimatedCostUsd).toBeCloseTo(12.5);
  });

  it('accumulates tokens but not cost for unknown models', () => {
    const tracker = new CostTracker();
    tracker.recordUsage('my-custom-ollama-model', { inputTokens: 500, outputTokens: 300 });

    const snapshot = tracker.getSnapshot();
    expect(snapshot.totalInputTokens).toBe(500);
    expect(snapshot.totalOutputTokens).toBe(300);
    expect(snapshot.estimatedCostUsd).toBe(0);
  });

  it('resets all counters', () => {
    const tracker = new CostTracker();
    tracker.recordUsage('gpt-4o', { inputTokens: 1000, outputTokens: 500 });
    tracker.reset();

    const snapshot = tracker.getSnapshot();
    expect(snapshot.totalInputTokens).toBe(0);
    expect(snapshot.totalOutputTokens).toBe(0);
    expect(snapshot.estimatedCostUsd).toBe(0);
  });

  it('handles mixed known and unknown models', () => {
    const tracker = new CostTracker();
    tracker.recordUsage('gpt-4o', { inputTokens: 1000, outputTokens: 500 });
    tracker.recordUsage('unknown-model', { inputTokens: 2000, outputTokens: 1000 });

    const snapshot = tracker.getSnapshot();
    expect(snapshot.totalInputTokens).toBe(3000);
    expect(snapshot.totalOutputTokens).toBe(1500);
    // Only gpt-4o should contribute to cost
    expect(snapshot.estimatedCostUsd).toBeGreaterThan(0);
  });
});
