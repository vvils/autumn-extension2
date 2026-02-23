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

    it('includes get_hotel_context hint when server available', () => {
      const prompt = buildPlannerSystemPrompt({ serverAvailable: true });
      expect(prompt).toContain('get_hotel_context');
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

describe('workflow hints', () => {
  it('includes workflow hints when serverAvailable is true', () => {
    const prompt = buildPlannerSystemPrompt({ serverAvailable: true });
    expect(prompt).toContain('WORKFLOW HINTS');
    expect(prompt).toContain('query_hotel_data');
    expect(prompt).toContain('push_rates_to_pms');
  });

  it('does not include workflow hints when serverAvailable is false', () => {
    const prompt = buildPlannerSystemPrompt({ serverAvailable: false });
    expect(prompt).not.toContain('WORKFLOW HINTS');
  });

  it('does not include workflow hints when options omitted', () => {
    const prompt = buildPlannerSystemPrompt();
    expect(prompt).not.toContain('WORKFLOW HINTS');
  });

  it('includes OTA workflow ask_user guard', () => {
    const prompt = buildPlannerSystemPrompt({ serverAvailable: true });
    expect(prompt).toContain('ask_user');
    expect(prompt).toContain('NOT complete until step 5');
  });
});

describe('connected integrations', () => {
  it('includes CONNECTED INTEGRATIONS section when provided', () => {
    const prompt = buildPlannerSystemPrompt({ connectedIntegrations: 'gmail: find-email, send-email' });
    expect(prompt).toContain('CONNECTED INTEGRATIONS');
  });

  it('includes group booking hints when provided', () => {
    const prompt = buildPlannerSystemPrompt({ connectedIntegrations: 'gmail: find-email, send-email' });
    expect(prompt).toContain('parse_group_inquiry');
    expect(prompt).toContain('generate_group_quote');
    expect(prompt).toContain('send_group_quote_email');
    expect(prompt).toContain('NOT complete until step 8');
    expect(prompt).toContain('discount');
  });

  it('does not include integrations section when omitted', () => {
    const prompt = buildPlannerSystemPrompt();
    expect(prompt).not.toContain('CONNECTED INTEGRATIONS');
  });

  it('does not include group booking hints when omitted', () => {
    const prompt = buildPlannerSystemPrompt();
    expect(prompt).not.toContain('parse_group_inquiry');
  });
});

describe('missing integration handling', () => {
  it('includes missing integration rule when no integrations connected', () => {
    const prompt = buildPlannerSystemPrompt();
    expect(prompt).toContain('MISSING INTEGRATION HANDLING');
    expect(prompt).toContain('autumn://settings/integrations');
  });

  it('includes missing integration rule when server available but no integrations', () => {
    const prompt = buildPlannerSystemPrompt({ serverAvailable: true });
    expect(prompt).toContain('MISSING INTEGRATION HANDLING');
    expect(prompt).toContain('autumn://settings/integrations');
  });

  it('includes missing integration rule even when integrations are connected', () => {
    const prompt = buildPlannerSystemPrompt({ connectedIntegrations: 'gmail: find-email, send-email' });
    expect(prompt).toContain('MISSING INTEGRATION HANDLING');
    expect(prompt).toContain('autumn://settings/integrations');
  });
});
