import { createStorage } from '../base/base';
import { StorageEnum } from '../base/enums';
import type { ChatHistoryStorage, ChatAgentStepHistory } from './types';

const getSessionAgentStepHistoryKey = (sessionId: string) => `chat_agent_step_${sessionId}`;

const getSessionAgentStepHistoryStorage = (sessionId: string) => {
  return createStorage<ChatAgentStepHistory>(
    getSessionAgentStepHistoryKey(sessionId),
    {
      task: '',
      history: '',
      timestamp: 0,
    },
    {
      storageEnum: StorageEnum.Local,
      liveUpdate: true,
    },
  );
};

export function createChatHistoryStorage(): ChatHistoryStorage {
  return {
    storeAgentStepHistory: async (sessionId: string, task: string, history: string): Promise<void> => {
      const agentStepHistoryStorage = getSessionAgentStepHistoryStorage(sessionId);
      await agentStepHistoryStorage.set({
        task,
        history,
        timestamp: Date.now(),
      });
    },

    loadAgentStepHistory: async (sessionId: string): Promise<ChatAgentStepHistory | null> => {
      const agentStepHistoryStorage = getSessionAgentStepHistoryStorage(sessionId);
      const history = await agentStepHistoryStorage.get();
      if (!history || !history.task || !history.timestamp || history.history === '' || history.history === '[]')
        return null;
      return history;
    },
  };
}

export const chatHistoryStore = createChatHistoryStorage();
