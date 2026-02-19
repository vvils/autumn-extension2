/* eslint-disable react/prop-types */
import { Trash2 } from 'lucide-react';
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

const ChatHistoryList: React.FC<ChatHistoryListProps> = ({ sessions, onSessionSelect, onSessionDelete }) => {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="scrollbar-thin h-full overflow-y-auto px-3 py-2">
      {sessions.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-gray-400">{'No chat history available'}</p>
      ) : (
        <div className="space-y-1">
          {sessions.map(session => (
            <div key={session.id} className="group relative">
              <button
                onClick={() => onSessionSelect(session.id)}
                className="w-full rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
                type="button">
                <div className="flex items-center justify-between gap-2 group-hover:pr-7">
                  <h3 className="truncate text-[13px] font-medium text-gray-900">{session.title}</h3>
                  <span className="shrink-0 text-[11px] text-gray-400">{formatDate(session.createdAt)}</span>
                </div>
              </button>

              <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onSessionDelete(session.id);
                  }}
                  className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  aria-label="Delete session"
                  type="button">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChatHistoryList;
