import type { Message } from '@extension/storage';
import { Actors } from '@extension/storage';
import { ACTOR_PROFILES } from '../types/message';
import { memo } from 'react';
import MarkdownContent from './MarkdownContent';
import WidgetRenderer from './widgets/WidgetRenderer';
import type { WidgetPayload, WidgetApplyFn, WidgetRespondFn } from './widgets/types';

interface MessageListProps {
  messages: Message[];
  isStreaming?: boolean;
  onWidgetApply?: WidgetApplyFn;
  onWidgetRespond?: WidgetRespondFn;
  onShortcutClick?: (shortcut: { command: string; prompt: string }) => void;
}

export default memo(function MessageList({
  messages,
  isStreaming = false,
  onWidgetApply,
  onWidgetRespond,
  onShortcutClick,
}: MessageListProps) {
  return (
    <div className="max-w-full space-y-4">
      {messages.map((message, index) => (
        <MessageBlock
          key={`${message.actor}-${index}`}
          message={message}
          isSameActor={index > 0 ? messages[index - 1].actor === message.actor : false}
          isStreaming={isStreaming && index === messages.length - 1}
          onWidgetApply={onWidgetApply}
          onWidgetRespond={onWidgetRespond}
          onShortcutClick={onShortcutClick}
        />
      ))}
    </div>
  );
});

function InlineShortcutContent({
  content,
  shortcuts,
  onClick,
}: {
  content: string;
  shortcuts: Array<{ command: string; prompt: string }>;
  onClick?: (shortcut: { command: string; prompt: string }) => void;
}) {
  const parts: Array<string | { shortcut: { command: string; prompt: string } }> = [];
  let remaining = content;

  for (const shortcut of shortcuts) {
    const token = `/${shortcut.command}`;
    const idx = remaining.indexOf(token);
    if (idx >= 0) {
      if (idx > 0) parts.push(remaining.slice(0, idx));
      parts.push({ shortcut });
      remaining = remaining.slice(idx + token.length);
    }
  }

  if (remaining) parts.push(remaining);

  if (parts.length === 0) {
    return (
      <>
        {shortcuts.map(s => (
          <ShortcutChipButton key={s.command} shortcut={s} onClick={onClick} />
        ))}
      </>
    );
  }

  return (
    <>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          <span key={i}>{part}</span>
        ) : (
          <ShortcutChipButton key={part.shortcut.command} shortcut={part.shortcut} onClick={onClick} />
        ),
      )}
    </>
  );
}

function ShortcutChipButton({
  shortcut,
  onClick,
}: {
  shortcut: { command: string; prompt: string };
  onClick?: (shortcut: { command: string; prompt: string }) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(shortcut)}
      className="inline rounded-md bg-white/20 px-1.5 py-0.5 font-medium transition-colors hover:bg-white/30">
      /{shortcut.command}
    </button>
  );
}

interface MessageBlockProps {
  message: Message;
  isSameActor: boolean;
  isStreaming?: boolean;
  onWidgetApply?: WidgetApplyFn;
  onWidgetRespond?: WidgetRespondFn;
  onShortcutClick?: (shortcut: { command: string; prompt: string }) => void;
}

function MessageBlock({
  message,
  isSameActor,
  isStreaming = false,
  onWidgetApply,
  onWidgetRespond,
  onShortcutClick,
}: MessageBlockProps) {
  if (!message.actor) {
    console.error('No actor found');
    return <div />;
  }
  const actor = ACTOR_PROFILES[message.actor as keyof typeof ACTOR_PROFILES];
  const isUser = message.actor === Actors.USER;

  if (isUser) {
    const shortcuts = message.shortcuts ?? (message.shortcut ? [message.shortcut] : []);

    return (
      <div className="flex animate-fade-in justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-gray-900 px-3.5 py-2.5 text-[13px] leading-relaxed text-white">
          {shortcuts.length > 0 ? (
            <InlineShortcutContent content={message.content} shortcuts={shortcuts} onClick={onShortcutClick} />
          ) : (
            message.content
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {!isSameActor && actor && (
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">{actor.name}</div>
      )}
      <div className="break-words text-[13px] leading-relaxed text-gray-900">
        <MarkdownContent content={message.content} />
        {isStreaming && <span className="ml-0.5 inline-block animate-pulse text-accent">|</span>}
      </div>
      {message.widgets && message.widgets.length > 0 && (
        <div className="mt-2 space-y-2">
          {message.widgets.map(w => (
            <WidgetRenderer
              key={w.widgetId}
              widget={w as WidgetPayload}
              onApply={onWidgetApply}
              onRespond={onWidgetRespond}
            />
          ))}
        </div>
      )}
      {!isStreaming && (
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
