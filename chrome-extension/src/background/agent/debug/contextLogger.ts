import type { BaseMessage } from '@langchain/core/messages';
import { createLogger } from '@src/background/log';

const logger = createLogger('ContextWindowLogger');

const STORAGE_KEY = '__debug_context_log';

function redactContent(text: string): string {
  let result = text.replace(
    /<nano_untrusted_content>[\s\S]*?<\/nano_untrusted_content>/g,
    '<nano_untrusted_content>[TREE]</nano_untrusted_content>',
  );
  result = result.replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g, '[SCREENSHOT]');
  return result;
}

function serializeSingleMessage(msg: BaseMessage, index: number): string {
  const role = msg._getType();
  let content: string;

  if (typeof msg.content === 'string') {
    content = redactContent(msg.content);
  } else if (Array.isArray(msg.content)) {
    content = msg.content
      .map(block => {
        if ('image_url' in block) return '[SCREENSHOT]';
        if ('text' in block) return redactContent(block.text);
        return JSON.stringify(block);
      })
      .join('\n');
  } else {
    content = String(msg.content);
  }

  let toolCallsStr = '';
  if ('tool_calls' in msg && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
    toolCallsStr = '\n[Tool calls]: ' + JSON.stringify(msg.tool_calls, null, 2);
  }

  return `[${index}] ${role}:\n${content}${toolCallsStr}`;
}

function serializeMessages(messages: BaseMessage[]): string {
  return messages.map((msg, i) => serializeSingleMessage(msg, i)).join('\n---\n');
}

interface ContextLogEntry {
  timestamp: string;
  agent: string;
  step: number;
  direction: 'input' | 'output';
  content: string;
}

export class ContextWindowLogger {
  private entries: ContextLogEntry[] = [];
  private taskId: string;

  constructor(taskId: string) {
    this.taskId = taskId;
  }

  logAgentContext(agent: string, step: number, messages: BaseMessage[]): void {
    this.entries.push({
      timestamp: new Date().toISOString(),
      agent,
      step,
      direction: 'input',
      content: serializeMessages(messages),
    });
  }

  logAgentResponse(agent: string, step: number, response: unknown): void {
    this.entries.push({
      timestamp: new Date().toISOString(),
      agent,
      step,
      direction: 'output',
      content: typeof response === 'string' ? response : JSON.stringify(response, null, 2),
    });
  }

  getLog(): string {
    const header = `Context Window Log — Task: ${this.taskId}\n${'='.repeat(80)}\n\n`;
    const body = this.entries
      .map(e => `[${e.timestamp}] [${e.agent}] [Step ${e.step}] [${e.direction}]\n${e.content}`)
      .join('\n\n' + '='.repeat(80) + '\n\n');
    return header + body;
  }

  async flush(): Promise<void> {
    const logString = this.getLog();
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: logString });
    } catch (err) {
      logger.error('Failed to persist context log', err);
    }
    console.log(logString);
  }

  reset(): void {
    this.entries = [];
  }
}
