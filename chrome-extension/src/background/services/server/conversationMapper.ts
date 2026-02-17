import type { Actors, Message } from '@extension/storage';
import type { ServerConversation, ServerMessage } from './types';

export interface ChatHistoryItem {
  id: string;
  title: string;
  createdAt: number;
  source?: string;
}

export function serverConversationToListItem(conv: ServerConversation): ChatHistoryItem {
  return {
    id: conv.id,
    title: conv.title,
    createdAt: new Date(conv.createdAt).getTime(),
    source: conv.source,
  };
}

export function serverMessageToAppMessage(msg: ServerMessage): Message {
  return {
    actor: msg.role as Actors,
    content: msg.content,
    timestamp: new Date(msg.createdAt).getTime(),
  };
}

export function appMessageToServerPayload(msg: Message): { role: string; content: string; timestamp: number } {
  return {
    role: msg.actor,
    content: msg.content,
    timestamp: msg.timestamp,
  };
}
