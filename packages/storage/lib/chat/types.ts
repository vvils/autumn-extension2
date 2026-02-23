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
