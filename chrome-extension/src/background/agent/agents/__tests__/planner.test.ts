import { describe, it, expect } from 'vitest';
import { plannerOutputSchema, TaskType } from '../planner';

function basePlannerInput(overrides: Record<string, unknown> = {}) {
  return {
    observation: '',
    challenges: '',
    done: false,
    next_steps: '',
    final_answer: '',
    reasoning: '',
    ...overrides,
  };
}

describe('plannerOutputSchema', () => {
  describe('task_type resolution via transform', () => {
    it('parses task_type "general" → TaskType.GENERAL', () => {
      const result = plannerOutputSchema.parse(basePlannerInput({ task_type: 'general' }));
      expect(result.task_type).toBe(TaskType.GENERAL);
    });

    it('parses task_type "domain_query" → TaskType.DOMAIN_QUERY', () => {
      const result = plannerOutputSchema.parse(basePlannerInput({ task_type: 'domain_query' }));
      expect(result.task_type).toBe(TaskType.DOMAIN_QUERY);
    });

    it('parses task_type "browser" → TaskType.BROWSER', () => {
      const result = plannerOutputSchema.parse(basePlannerInput({ task_type: 'browser' }));
      expect(result.task_type).toBe(TaskType.BROWSER);
    });

    it('maps alias "chat" → GENERAL', () => {
      const result = plannerOutputSchema.parse(basePlannerInput({ task_type: 'chat' }));
      expect(result.task_type).toBe(TaskType.GENERAL);
    });

    it('maps alias "hotel" → DOMAIN_QUERY', () => {
      const result = plannerOutputSchema.parse(basePlannerInput({ task_type: 'hotel' }));
      expect(result.task_type).toBe(TaskType.DOMAIN_QUERY);
    });

    it('maps alias "web" → BROWSER', () => {
      const result = plannerOutputSchema.parse(basePlannerInput({ task_type: 'web' }));
      expect(result.task_type).toBe(TaskType.BROWSER);
    });

    it('strips non-alpha chars: "browser!" → BROWSER', () => {
      const result = plannerOutputSchema.parse(basePlannerInput({ task_type: 'browser!' }));
      expect(result.task_type).toBe(TaskType.BROWSER);
    });

    it('is case-insensitive: "DOMAIN_QUERY" → DOMAIN_QUERY', () => {
      const result = plannerOutputSchema.parse(basePlannerInput({ task_type: 'DOMAIN_QUERY' }));
      expect(result.task_type).toBe(TaskType.DOMAIN_QUERY);
    });
  });

  describe('fallback to web_task when task_type absent', () => {
    it('web_task true → BROWSER', () => {
      const result = plannerOutputSchema.parse(basePlannerInput({ web_task: true }));
      expect(result.task_type).toBe(TaskType.BROWSER);
    });

    it('web_task false → GENERAL', () => {
      const result = plannerOutputSchema.parse(basePlannerInput({ web_task: false }));
      expect(result.task_type).toBe(TaskType.GENERAL);
    });

    it('web_task "true" (string) → BROWSER', () => {
      const result = plannerOutputSchema.parse(basePlannerInput({ web_task: 'true' }));
      expect(result.task_type).toBe(TaskType.BROWSER);
    });

    it('web_task "false" (string) → GENERAL', () => {
      const result = plannerOutputSchema.parse(basePlannerInput({ web_task: 'false' }));
      expect(result.task_type).toBe(TaskType.GENERAL);
    });
  });

  describe('defaults when both fields absent', () => {
    it('neither task_type nor web_task → BROWSER (safe default)', () => {
      const result = plannerOutputSchema.parse(basePlannerInput());
      expect(result.task_type).toBe(TaskType.BROWSER);
    });
  });

  describe('web_task is now optional', () => {
    it('schema accepts input without web_task field', () => {
      const input = basePlannerInput({ task_type: 'general' });
      delete input.web_task;
      const result = plannerOutputSchema.parse(input);
      expect(result.task_type).toBe(TaskType.GENERAL);
    });

    it('schema accepts input without task_type field', () => {
      const input = basePlannerInput({ web_task: true });
      delete input.task_type;
      const result = plannerOutputSchema.parse(input);
      expect(result.task_type).toBe(TaskType.BROWSER);
    });

    it('schema accepts input with both fields (task_type wins)', () => {
      const result = plannerOutputSchema.parse(basePlannerInput({ task_type: 'general', web_task: true }));
      expect(result.task_type).toBe(TaskType.GENERAL);
    });
  });

  describe('done field string coercion (regression)', () => {
    it('done "true" → boolean true', () => {
      const result = plannerOutputSchema.parse(basePlannerInput({ done: 'true' }));
      expect(result.done).toBe(true);
    });

    it('done "false" → boolean false', () => {
      const result = plannerOutputSchema.parse(basePlannerInput({ done: 'false' }));
      expect(result.done).toBe(false);
    });
  });
});
