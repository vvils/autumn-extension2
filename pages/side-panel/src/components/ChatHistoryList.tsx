/* eslint-disable react/prop-types */
import { useState } from 'react';
import { Ellipsis, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

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

const springTransition = { type: 'spring' as const, duration: 0.25, bounce: 0 };

const ChatHistoryRow: React.FC<{
  session: ChatHistoryItem;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({ session, onSelect, onDelete }) => {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleting(true);
    onDelete(session.id);
  };

  return (
    <motion.div
      layout="position"
      transition={springTransition}
      exit={{ opacity: 0, scale: 0.96, filter: 'blur(4px)' }}
      className={`group flex cursor-pointer items-center gap-[12px] rounded-[14px] px-[16px] py-[10px] hover:bg-black/5 ${
        deleting ? 'pointer-events-none opacity-50' : ''
      }`}
      onClick={() => onSelect(session.id)}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(session.id);
      }}>
      <span className="min-w-0 flex-1 truncate text-[14px] text-black opacity-90">{session.title}</span>
      <div className="relative shrink-0 flex h-[20px] items-center">
        <span className="text-[12px] text-black/30 transition-opacity group-hover:opacity-0">
          {formatRelativeTime(session.createdAt)}
        </span>
        <button
          onClick={handleDelete}
          className="absolute inset-0 flex items-center justify-end text-black/30 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
          aria-label="Delete session"
          type="button">
          <Trash2 size={14} />
        </button>
      </div>
    </motion.div>
  );
};

const ChatHistoryList: React.FC<ChatHistoryListProps> = ({ sessions, onSessionSelect, onSessionDelete }) => {
  const [expanded, setExpanded] = useState(false);

  const hasMore = sessions.length > MAX_VISIBLE;
  const displayedSessions = expanded ? sessions : sessions.slice(0, MAX_VISIBLE);

  return (
    <div className="px-[12px] pt-3">
      <p className="px-[4px] pb-[8px] font-normal text-[14px] text-black/35">Chats</p>
      {sessions.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-black/40">No chat history</p>
      ) : (
        <>
          <AnimatePresence mode="popLayout" initial={false}>
            {displayedSessions.map(session => (
              <ChatHistoryRow
                key={session.id}
                session={session}
                onSelect={onSessionSelect}
                onDelete={onSessionDelete}
              />
            ))}
          </AnimatePresence>
          {hasMore && !expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-[0.875rem] px-2.5 h-10 text-neutral-400 transition-colors hover:text-neutral-600 hover:bg-neutral-100"
              aria-label="Show all chats">
              <div className="flex relative justify-center items-center size-5 shrink-0">
                <Ellipsis className="w-4" />
              </div>
              <span className="text-sm font-normal">More</span>
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default ChatHistoryList;
