import { describe, it, expect } from 'vitest';
import { mergeWidgetIntoMessages } from '@extension/storage';
import { type Message, Actors } from '@extension/storage';

const NOW = 1700000000000;

function makeWidget(id: string, data: Record<string, unknown> = {}) {
  return { widgetId: id, type: 'hotel_metrics', data };
}

function userMessage(content = 'hello'): Message {
  return { actor: Actors.USER, content, timestamp: NOW - 2000 };
}

function synthesizerMessage(content = '', widgets?: Message['widgets']): Message {
  return { actor: Actors.SYNTHESIZER, content, timestamp: NOW - 1000, ...(widgets ? { widgets } : {}) };
}

describe('mergeWidgetIntoMessages', () => {
  it('creates SYNTHESIZER message when empty', () => {
    const result = mergeWidgetIntoMessages([], makeWidget('w1'), NOW);
    expect(result).toHaveLength(1);
    expect(result[0].actor).toBe(Actors.SYNTHESIZER);
    expect(result[0].content).toBe('');
    expect(result[0].widgets).toEqual([makeWidget('w1')]);
  });

  it('appends widget to last SYNTHESIZER message', () => {
    const messages = [userMessage(), synthesizerMessage('analysis')];
    const result = mergeWidgetIntoMessages(messages, makeWidget('w1'), NOW);
    expect(result[1].widgets).toEqual([makeWidget('w1')]);
  });

  it('appends new widget alongside existing', () => {
    const messages = [synthesizerMessage('', [makeWidget('a')])];
    const result = mergeWidgetIntoMessages(messages, makeWidget('b'), NOW);
    expect(result[0].widgets).toEqual([makeWidget('a'), makeWidget('b')]);
  });

  it('replaces widget by matching widgetId', () => {
    const original = makeWidget('a', { v: 1 });
    const updated = makeWidget('a', { v: 2 });
    const messages = [synthesizerMessage('', [original])];
    const result = mergeWidgetIntoMessages(messages, updated, NOW);
    expect(result[0].widgets).toEqual([updated]);
  });

  it('preserves other widgets when replacing', () => {
    const a = makeWidget('a');
    const b = makeWidget('b', { v: 1 });
    const bUpdated = makeWidget('b', { v: 2 });
    const messages = [synthesizerMessage('', [a, b])];
    const result = mergeWidgetIntoMessages(messages, bUpdated, NOW);
    expect(result[0].widgets).toEqual([a, bUpdated]);
  });

  it('targets last SYNTHESIZER, not earlier', () => {
    const messages = [synthesizerMessage('first'), userMessage(), synthesizerMessage('second')];
    const result = mergeWidgetIntoMessages(messages, makeWidget('w1'), NOW);
    expect(result[0].widgets).toBeUndefined();
    expect(result[2].widgets).toEqual([makeWidget('w1')]);
  });

  it('creates new msg when only non-SYNTHESIZER exist', () => {
    const messages = [userMessage()];
    const result = mergeWidgetIntoMessages(messages, makeWidget('w1'), NOW);
    expect(result).toHaveLength(2);
    expect(result[1].actor).toBe(Actors.SYNTHESIZER);
    expect(result[1].widgets).toEqual([makeWidget('w1')]);
  });

  it('preserves message content and timestamp', () => {
    const messages = [synthesizerMessage('important analysis')];
    const result = mergeWidgetIntoMessages(messages, makeWidget('w1'), NOW);
    expect(result[0].content).toBe('important analysis');
    expect(result[0].timestamp).toBe(NOW - 1000);
  });

  it('does not mutate input array', () => {
    const messages = [synthesizerMessage()];
    const original = [...messages];
    mergeWidgetIntoMessages(messages, makeWidget('w1'), NOW);
    expect(messages).toEqual(original);
    expect(messages).toHaveLength(1);
  });

  it('does not mutate original message', () => {
    const widget = makeWidget('a');
    const msg = synthesizerMessage('', [widget]);
    const messages = [msg];
    mergeWidgetIntoMessages(messages, makeWidget('b'), NOW);
    expect(msg.widgets).toEqual([widget]);
  });
});
