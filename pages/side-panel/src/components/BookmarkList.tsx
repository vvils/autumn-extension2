/* eslint-disable react/prop-types */
import { useState, useRef, useEffect } from 'react';
import { Trash2, Pencil, Check, X } from 'lucide-react';
import { t } from '@extension/i18n';

interface Bookmark {
  id: number;
  title: string;
  content: string;
}

interface BookmarkListProps {
  bookmarks: Bookmark[];
  onBookmarkSelect: (content: string) => void;
  onBookmarkUpdateTitle?: (id: number, title: string) => void;
  onBookmarkDelete?: (id: number) => void;
  onBookmarkReorder?: (draggedId: number, targetId: number) => void;
}

const BookmarkList: React.FC<BookmarkListProps> = ({
  bookmarks,
  onBookmarkSelect,
  onBookmarkUpdateTitle,
  onBookmarkDelete,
  onBookmarkReorder,
}) => {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleEditClick = (bookmark: Bookmark) => {
    setEditingId(bookmark.id);
    setEditTitle(bookmark.title);
  };

  const handleSaveEdit = (id: number) => {
    if (onBookmarkUpdateTitle && editTitle.trim()) {
      onBookmarkUpdateTitle(id, editTitle);
    }
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleDragStart = (e: React.DragEvent, id: number) => {
    setDraggedId(id);
    e.dataTransfer.setData('text/plain', id.toString());
    e.currentTarget.classList.add('opacity-25');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('opacity-25');
    setDraggedId(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    if (draggedId === null || draggedId === targetId) return;

    if (onBookmarkReorder) {
      onBookmarkReorder(draggedId, targetId);
    }
  };

  useEffect(() => {
    if (editingId !== null && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingId]);

  return (
    <div className="px-3 pb-2">
      <h3 className="mb-2 px-1 text-[12px] font-medium uppercase tracking-wide text-gray-400">
        {t('chat_bookmarks_header')}
      </h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {bookmarks.map(bookmark => (
          <div
            key={bookmark.id}
            draggable={editingId !== bookmark.id}
            onDragStart={e => handleDragStart(e, bookmark.id)}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDrop={e => handleDrop(e, bookmark.id)}
            className="group relative rounded-xl border border-gray-100 p-3 transition-colors hover:bg-gray-50">
            {editingId === bookmark.id ? (
              <div className="flex items-center gap-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="focus:border-accent/40 focus:ring-accent/10 grow rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-gray-900 outline-none focus:ring-2"
                />
                <button
                  onClick={() => handleSaveEdit(bookmark.id)}
                  className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-green-50 hover:text-green-600"
                  aria-label={t('chat_bookmarks_saveEdit')}
                  type="button">
                  <Check size={14} />
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  aria-label={t('chat_bookmarks_cancelEdit')}
                  type="button">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => onBookmarkSelect(bookmark.content)} className="w-full text-left">
                <div className="truncate pr-10 text-[13px] font-medium text-gray-700">{bookmark.title}</div>
              </button>
            )}

            {editingId !== bookmark.id && (
              <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={e => {
                    e.stopPropagation();
                    handleEditClick(bookmark);
                  }}
                  className="hover:text-accent hover:bg-accent/[0.08] rounded-md p-1.5 text-gray-400 transition-colors"
                  aria-label={t('chat_bookmarks_edit')}
                  type="button">
                  <Pencil size={13} />
                </button>

                <button
                  onClick={e => {
                    e.stopPropagation();
                    if (onBookmarkDelete) {
                      onBookmarkDelete(bookmark.id);
                    }
                  }}
                  className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  aria-label={t('chat_bookmarks_delete')}
                  type="button">
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default BookmarkList;
