/* eslint-disable react/prop-types */
import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, Trash2, MoreHorizontal } from 'lucide-react';

interface ChatHistoryItem {
  id: string;
  title: string;
  createdAt: number;
  source?: string;
}

interface ChatHistoryListProps {
  sessions: ChatHistoryItem[];
  onSessionSelect: (sessionId: string) => void;
  onSessionDelete: (sessionId: string) => void;
}

const MAX_VISIBLE = 6;

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const ChatHistoryList: React.FC<ChatHistoryListProps> = ({ sessions, onSessionSelect, onSessionDelete }) => {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearConfirmTimer = useCallback(() => {
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return clearConfirmTimer;
  }, [clearConfirmTimer]);

  const handleDeleteClick = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (confirmingId === sessionId) {
      clearConfirmTimer();
      setConfirmingId(null);
      onSessionDelete(sessionId);
    } else {
      clearConfirmTimer();
      setConfirmingId(sessionId);
      confirmTimerRef.current = setTimeout(() => setConfirmingId(null), 3000);
    }
  };

  const hasMore = sessions.length > MAX_VISIBLE;
  const displayedSessions = expanded ? sessions : sessions.slice(0, MAX_VISIBLE);

  return (
    <div className="px-[12px] pt-3">
      <p className="px-[4px] pb-[8px] text-[14px] text-black/35 font-normal">Chats</p>
      {sessions.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-black/40">No chat history</p>
      ) : (
        <>
          {displayedSessions.map(session => (
            <div
              key={session.id}
              className="flex items-center gap-[12px] rounded-[14px] px-[16px] py-[10px] hover:bg-black/5 cursor-pointer group"
              onClick={() => onSessionSelect(session.id)}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') onSessionSelect(session.id);
              }}>
              <MessageSquare size={16} className="shrink-0 text-black/25" />
              <span className="min-w-0 flex-1 truncate text-[14px] text-black opacity-90">{session.title}</span>
              <div className="relative shrink-0 flex items-center h-[20px]">
                <span className="text-[12px] text-black/30 transition-opacity group-hover:opacity-0">
                  {formatRelativeTime(session.createdAt)}
                </span>
                <button
                  onClick={e => handleDeleteClick(e, session.id)}
                  className={`absolute inset-0 flex items-center justify-end opacity-0 transition-opacity group-hover:opacity-100 ${
                    confirmingId === session.id ? 'text-red-500' : 'text-black/30 hover:text-red-500'
                  }`}
                  aria-label="Delete session"
                  type="button">
                  {confirmingId === session.id ? (
                    <span className="text-[11px] font-medium">Confirm</span>
                  ) : (
                    <Trash2 size={14} />
                  )}
                </button>
              </div>
            </div>
          ))}
          {hasMore && !expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-1 flex w-full items-center justify-center rounded-[14px] py-2 text-black/30 transition-colors hover:bg-black/5 hover:text-black/50"
              aria-label="Show more chats">
              <MoreHorizontal size={18} />
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default ChatHistoryList;
