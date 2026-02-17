import type { Message } from './types';
import { Actors } from './types';

type Widget = { widgetId: string; type: string; data: Record<string, unknown> };

export function mergeWidgetIntoMessages(messages: Message[], widget: Widget, timestamp: number): Message[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].actor === Actors.SYNTHESIZER) {
      const msg = messages[i];
      const existing = msg.widgets ?? [];
      const idx = existing.findIndex(w => w.widgetId === widget.widgetId);

      const updatedWidgets = idx >= 0 ? existing.map((w, j) => (j === idx ? widget : w)) : [...existing, widget];

      const result = [...messages];
      result[i] = { ...msg, widgets: updatedWidgets };
      return result;
    }
  }

  return [...messages, { actor: Actors.SYNTHESIZER, content: '', timestamp, widgets: [widget] }];
}
