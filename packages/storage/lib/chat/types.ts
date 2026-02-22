export enum Actors {
  SYSTEM = 'system',
  USER = 'user',
  PLANNER = 'planner',
  NAVIGATOR = 'navigator',
  VALIDATOR = 'validator',
  SYNTHESIZER = 'synthesizer',
}

export interface Message {
  actor: Actors;
  content: string;
  timestamp: number; // Unix timestamp in milliseconds
  widgets?: Array<{ widgetId: string; type: string; data: Record<string, unknown> }>;
  shortcut?: { command: string; prompt: string };
  shortcuts?: Array<{ command: string; prompt: string }>;
  quickAction?: { name: string; description: string; prompt: string };
}

export interface ChatMessage extends Message {
  id: string; // Unique ID for each message
}

export interface ChatSessionMetadata {
  id: string;
  title: string;
  createdAt: number; // Unix timestamp in milliseconds
  updatedAt: number; // Unix timestamp in milliseconds
  messageCount: number;
}

// ChatSession is the full conversation history displayed in the Sidepanel
export interface ChatSession extends ChatSessionMetadata {
  messages: ChatMessage[];
}

// ChatAgentStepHistory is the history of the every step of the agent
export interface ChatAgentStepHistory {
  task: string;
  history: string;
  timestamp: number; // Unix timestamp in milliseconds
}

export interface ChatHistoryStorage {
  storeAgentStepHistory: (sessionId: string, task: string, history: string) => Promise<void>;
  loadAgentStepHistory: (sessionId: string) => Promise<ChatAgentStepHistory | null>;
}
