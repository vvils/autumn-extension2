import { describe, it, expect } from 'vitest';
import { buildPlannerSystemPrompt } from '../templates/planner';
import { PlannerPrompt } from '../planner';

describe('buildPlannerSystemPrompt', () => {
  describe('without server (standalone mode)', () => {
    const prompt = buildPlannerSystemPrompt();

    it('includes "general" and "browser" in task_type list', () => {
      expect(prompt).toContain('"general"');
      expect(prompt).toContain('"browser"');
    });

    it('does NOT include "domain_query" in response format', () => {
      expect(prompt).not.toContain('domain_query');
    });

    it('includes security rules', () => {
      expect(prompt).toContain('SECURITY RULES');
    });

    it('includes task completion validation section', () => {
      expect(prompt).toContain('TASK COMPLETION VALIDATION');
    });
  });

  describe('with server available', () => {
    it('includes "domain_query" in task_type response format', () => {
      const prompt = buildPlannerSystemPrompt({ serverAvailable: true });
      expect(prompt).toContain('domain_query');
    });

    it('includes all three types: general, domain_query, browser', () => {
      const prompt = buildPlannerSystemPrompt({ serverAvailable: true });
      expect(prompt).toContain('"general"');
      expect(prompt).toContain('"domain_query"');
      expect(prompt).toContain('"browser"');
    });

    it('includes hotel capabilities when provided', () => {
      const prompt = buildPlannerSystemPrompt({
        serverAvailable: true,
        hotelCapabilities: 'Rate parity checking\nCompetitor analysis',
      });
      expect(prompt).toContain('Rate parity checking');
      expect(prompt).toContain('Competitor analysis');
    });

    it('does NOT include hotel capabilities section when not provided', () => {
      const prompt = buildPlannerSystemPrompt({ serverAvailable: true });
      expect(prompt).not.toContain('Available hotel data capabilities');
    });
  });
});

describe('PlannerPrompt', () => {
  it('default constructor produces standalone prompt (no domain_query)', () => {
    const plannerPrompt = new PlannerPrompt();
    const message = plannerPrompt.getSystemMessage();
    expect(message.content).not.toContain('domain_query');
  });

  it('constructor with serverAvailable=true produces server prompt', () => {
    const plannerPrompt = new PlannerPrompt(true);
    const message = plannerPrompt.getSystemMessage();
    expect(message.content as string).toContain('domain_query');
  });
});
