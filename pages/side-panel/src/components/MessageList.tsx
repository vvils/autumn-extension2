import type { Message } from '@extension/storage';
import { Actors } from '@extension/storage';
import { ACTOR_PROFILES } from '../types/message';
import { memo } from 'react';

interface MessageListProps {
  messages: Message[];
  isStreaming?: boolean;
}

export default memo(function MessageList({ messages, isStreaming = false }: MessageListProps) {
  return (
    <div className="max-w-full space-y-4">
      {messages.map((message, index) => (
        <MessageBlock
          key={`${message.actor}-${index}`}
          message={message}
          isSameActor={index > 0 ? messages[index - 1].actor === message.actor : false}
          isStreaming={isStreaming && index === messages.length - 1}
        />
      ))}
    </div>
  );
});

interface MessageBlockProps {
  message: Message;
  isSameActor: boolean;
  isStreaming?: boolean;
}

function MessageBlock({ message, isSameActor, isStreaming = false }: MessageBlockProps) {
  if (!message.actor) {
    console.error('No actor found');
    return <div />;
  }
  const actor = ACTOR_PROFILES[message.actor as keyof typeof ACTOR_PROFILES];
  const isProgress = message.content === 'Showing progress...';
  const isUser = message.actor === Actors.USER;

  if (isUser) {
    return (
      <div className="flex animate-fade-in justify-end">
        <div className="bg-accent max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md px-3.5 py-2.5 text-[13px] leading-relaxed text-white">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {!isSameActor && (
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">{actor.name}</div>
      )}
      <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-gray-900">
        {isProgress ? (
          <div className="h-1 overflow-hidden rounded bg-gray-100">
            <div className="bg-accent-muted h-full animate-progress" />
          </div>
        ) : (
          <>
            {message.content}
            {isStreaming && <span className="text-accent ml-0.5 inline-block animate-pulse">|</span>}
          </>
        )}
      </div>
      {!isProgress && !isStreaming && (
        <div className="mt-0.5 text-right text-[10px] text-gray-300">{formatTimestamp(message.timestamp)}</div>
      )}
    </div>
  );
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();

  const isToday = date.toDateString() === now.toDateString();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const isThisYear = date.getFullYear() === now.getFullYear();

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isToday) {
    return timeStr;
  }

  if (isYesterday) {
    return `Yesterday, ${timeStr}`;
  }

  if (isThisYear) {
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
  }

  return `${date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}, ${timeStr}`;
}
