import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Mic, Paperclip, ArrowUp, Square, Play, X } from 'lucide-react';
import { shortcutSettingsStore } from '@extension/storage';
import type { SavedShortcut } from '@extension/storage';
import { CostDisplay, type CostDisplayProps } from './CostDisplay';
import ShortcutDropdown from './ShortcutDropdown';

export interface ShortcutActions {
  updateShortcut: (command: string, prompt: string) => void;
  clearShortcut: () => void;
}

interface ChatInputProps {
  onSendMessage: (text: string, displayText?: string, shortcut?: { command: string; prompt: string }) => void;
  onStopTask: () => void;
  onMicClick?: () => void;
  isRecording?: boolean;
  disabled: boolean;
  showStopButton: boolean;
  setContent?: (setter: (text: string) => void) => void;
  onEditShortcut?: (shortcut: { id: string; command: string; prompt: string }) => void;
  onCreateShortcut?: () => void;
  setShortcutActions?: (actions: ShortcutActions) => void;
  historicalSessionId?: string | null;
  onReplay?: (sessionId: string) => void;
  costData?: CostDisplayProps | null;
  elapsedTime?: string | null;
}

interface AttachedFile {
  name: string;
  content: string;
  type: string;
}

function getShortcutContext(text: string, cursorPos: number): { slashIndex: number; query: string } | null {
  for (let i = cursorPos - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === '/') {
      if (i === 0 || /\s/.test(text[i - 1])) {
        return { slashIndex: i, query: text.slice(i + 1, cursorPos) };
      }
      return null;
    }
    if (/\s/.test(ch)) return null;
  }
  return null;
}

export default function ChatInput({
  onSendMessage,
  onStopTask,
  onMicClick,
  isRecording = false,
  disabled,
  showStopButton,
  setContent,
  onEditShortcut,
  onCreateShortcut,
  setShortcutActions,
  historicalSessionId,
  onReplay,
  costData,
  elapsedTime,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [shortcutQuery, setShortcutQuery] = useState('');
  const [selectedShortcutIndex, setSelectedShortcutIndex] = useState(0);
  const [shortcuts, setShortcuts] = useState<SavedShortcut[]>([]);
  const [selectedShortcut, setSelectedShortcut] = useState<SavedShortcut | null>(null);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [slashTriggerIndex, setSlashTriggerIndex] = useState<number | null>(null);

  useEffect(() => {
    if (showShortcuts) {
      shortcutSettingsStore.getSettings().then(s => setShortcuts(s.shortcuts));
    }
  }, [showShortcuts]);

  const filteredShortcuts = useMemo(
    () => shortcuts.filter(s => s.command.toLowerCase().includes(shortcutQuery.toLowerCase())),
    [shortcuts, shortcutQuery],
  );

  const maxDropdownIndex = onCreateShortcut ? filteredShortcuts.length : Math.max(0, filteredShortcuts.length - 1);
  const effectiveIndex = Math.min(selectedShortcutIndex, maxDropdownIndex);

  const isSendButtonDisabled = useMemo(
    () => disabled || (text.trim() === '' && attachedFiles.length === 0 && !selectedShortcut),
    [disabled, text, attachedFiles, selectedShortcut],
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart ?? value.length;
    setText(value);
    resizeTextarea();
    const ctx = getShortcutContext(value, cursorPos);
    if (ctx) {
      setShowShortcuts(true);
      setShortcutQuery(ctx.query);
      setSlashTriggerIndex(ctx.slashIndex);
      setSelectedShortcutIndex(0);
    } else {
      setShowShortcuts(false);
      setSlashTriggerIndex(null);
    }
  };

  const recheckShortcutContext = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const ctx = getShortcutContext(textarea.value, textarea.selectionStart);
    if (ctx) {
      setShowShortcuts(true);
      setShortcutQuery(ctx.query);
      setSlashTriggerIndex(ctx.slashIndex);
      setSelectedShortcutIndex(0);
    } else {
      setShowShortcuts(false);
      setSlashTriggerIndex(null);
    }
  }, []);

  useEffect(() => {
    if (setContent) {
      setContent(setText);
    }
  }, [setContent]);

  useEffect(() => {
    if (setShortcutActions) {
      setShortcutActions({
        updateShortcut: (command: string, prompt: string) => {
          setSelectedShortcut(prev => (prev ? { ...prev, command, prompt } : null));
          setEditedPrompt(prompt);
        },
        clearShortcut: () => {
          setSelectedShortcut(null);
          setEditedPrompt('');
        },
      });
    }
  }, [setShortcutActions]);

  useEffect(() => {
    resizeTextarea();
  }, [text, resizeTextarea]);

  const handleSubmit = useCallback(() => {
    if (selectedShortcut) {
      const promptToSend = editedPrompt || selectedShortcut.prompt;
      const trimmedText = text.trim();
      const messageContent = trimmedText ? `${promptToSend}\n\n${trimmedText}` : promptToSend;
      const displayContent = trimmedText
        ? `/${selectedShortcut.command} ${trimmedText}`
        : `/${selectedShortcut.command}`;
      onSendMessage(messageContent, displayContent, {
        command: selectedShortcut.command,
        prompt: promptToSend,
      });
      setText('');
      setSelectedShortcut(null);
      setEditedPrompt('');
      setAttachedFiles([]);
      return;
    }

    const trimmedText = text.trim();

    if (trimmedText || attachedFiles.length > 0) {
      let messageContent = trimmedText;
      let displayContent = trimmedText;

      if (attachedFiles.length > 0) {
        const fileContents = attachedFiles
          .map(file => {
            return `\n\n<nano_file_content type="file" name="${file.name}">\n${file.content}\n</nano_file_content>`;
          })
          .join('\n');

        messageContent = trimmedText
          ? `${trimmedText}\n\n<nano_attached_files>${fileContents}</nano_attached_files>`
          : `<nano_attached_files>${fileContents}</nano_attached_files>`;

        const fileList = attachedFiles.map(file => `📎 ${file.name}`).join('\n');
        displayContent = trimmedText ? `${trimmedText}\n\n${fileList}` : fileList;
      }

      onSendMessage(messageContent, displayContent);
      setText('');
      setAttachedFiles([]);
    }
  }, [text, attachedFiles, selectedShortcut, editedPrompt, onSendMessage]);

  const handleCreateShortcutFromDropdown = useCallback(() => {
    setShowShortcuts(false);
    setSlashTriggerIndex(null);
    setText('');
    onCreateShortcut?.();
  }, [onCreateShortcut]);

  const handleShortcutSelect = useCallback(
    (shortcut: SavedShortcut) => {
      if (slashTriggerIndex === null) return;

      const beforeSlash = text.slice(0, slashTriggerIndex);
      const afterQuery = text.slice(slashTriggerIndex + 1 + shortcutQuery.length);
      const isStandaloneCommand = !beforeSlash && !afterQuery;

      if (isStandaloneCommand) {
        setSelectedShortcut(shortcut);
        setEditedPrompt(shortcut.prompt);
        setText('');
      } else {
        const expanded = beforeSlash + shortcut.prompt + afterQuery;
        setText(expanded);
        const cursorPos = beforeSlash.length + shortcut.prompt.length;
        requestAnimationFrame(() => {
          textareaRef.current?.setSelectionRange(cursorPos, cursorPos);
        });
      }

      setShowShortcuts(false);
      setSlashTriggerIndex(null);
      textareaRef.current?.focus();
    },
    [slashTriggerIndex, text, shortcutQuery],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showShortcuts) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedShortcutIndex(prev => Math.min(prev + 1, maxDropdownIndex));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedShortcutIndex(prev => Math.max(0, prev - 1));
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowShortcuts(false);
          setSlashTriggerIndex(null);
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (onCreateShortcut && effectiveIndex === filteredShortcuts.length) {
            handleCreateShortcutFromDropdown();
          } else if (filteredShortcuts.length > 0) {
            handleShortcutSelect(filteredShortcuts[effectiveIndex]);
          } else {
            setShowShortcuts(false);
          }
          return;
        }
      }
      if (e.key === 'Backspace' && selectedShortcut && text === '') {
        e.preventDefault();
        setSelectedShortcut(null);
        setEditedPrompt('');
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [
      handleSubmit,
      showShortcuts,
      filteredShortcuts,
      effectiveIndex,
      handleShortcutSelect,
      selectedShortcut,
      text,
      handleCreateShortcutFromDropdown,
    ],
  );

  const handleReplay = useCallback(() => {
    if (historicalSessionId && onReplay) {
      onReplay(historicalSessionId);
    }
  }, [historicalSessionId, onReplay]);

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles: AttachedFile[] = [];
    const allowedTypes = ['.txt', '.md', '.markdown', '.json', '.csv', '.log', '.xml', '.yaml', '.yml'];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();

      if (!allowedTypes.includes(fileExt)) {
        console.warn(`File type ${fileExt} not supported. Only text-based files are allowed.`);
        continue;
      }

      if (file.size > 1024 * 1024) {
        console.warn(`File ${file.name} is too large. Maximum size is 1MB.`);
        continue;
      }

      try {
        const content = await file.text();
        newFiles.push({
          name: file.name,
          content,
          type: file.type || 'text/plain',
        });
      } catch (error) {
        console.error(`Error reading file ${file.name}:`, error);
      }
    }

    if (newFiles.length > 0) {
      setAttachedFiles(prev => [...prev, ...newFiles]);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const renderActionButton = () => {
    if (showStopButton) {
      return (
        <button
          type="button"
          onClick={onStopTask}
          className="bg-accent hover:bg-accent-hover rounded-lg p-1.5 text-white transition-colors"
          aria-label="Stop">
          <Square size={14} fill="currentColor" strokeWidth={0} />
        </button>
      );
    }

    if (historicalSessionId) {
      return (
        <button
          type="button"
          onClick={handleReplay}
          disabled={!historicalSessionId}
          className="rounded-lg bg-green-500 p-1.5 text-white transition-colors hover:bg-green-600 disabled:opacity-30"
          aria-label="Replay">
          <Play size={14} fill="currentColor" strokeWidth={0} />
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSendButtonDisabled}
        className="bg-accent hover:bg-accent-hover rounded-lg p-1.5 text-white transition-colors disabled:opacity-30"
        aria-label="Send">
        <ArrowUp size={16} strokeWidth={2.5} />
      </button>
    );
  };

  return (
    <div className="shrink-0 bg-white px-3 pb-2 pt-1.5">
      <div
        className={`relative rounded-3xl border border-gray-200 bg-white px-4 pb-2.5 pt-3.5 shadow-sm transition-all ${disabled ? '' : 'focus-within:border-accent/40 focus-within:ring-accent/20 focus-within:ring-2'}`}>
        {showShortcuts && (
          <ShortcutDropdown
            shortcuts={filteredShortcuts}
            onSelect={handleShortcutSelect}
            onCreateShortcut={handleCreateShortcutFromDropdown}
            selectedIndex={effectiveIndex}
          />
        )}
        {attachedFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachedFiles.map((file, index) => (
              <div
                key={index}
                className="bg-accent-soft text-accent-foreground flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px]">
                <span className="max-w-[120px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(index)}
                  className="hover:bg-accent-light ml-0.5 rounded-full p-0.5 transition-colors"
                  aria-label={`Remove ${file.name}`}>
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-start gap-1.5">
          {selectedShortcut && (
            <button
              type="button"
              onClick={() => onEditShortcut?.(selectedShortcut)}
              className="bg-accent-soft text-accent-foreground shrink-0 rounded-md px-2 py-0.5 text-[13px] font-medium leading-relaxed transition-colors hover:opacity-80">
              /{selectedShortcut.command}
            </button>
          )}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onKeyUp={recheckShortcutContext}
            onClick={recheckShortcutContext}
            onBlur={() => {
              setShowShortcuts(false);
              setSlashTriggerIndex(null);
            }}
            disabled={disabled}
            aria-disabled={disabled}
            rows={1}
            className={`max-h-[200px] min-h-[24px] w-full resize-none bg-transparent text-[13px] leading-relaxed text-gray-900 outline-none placeholder:text-gray-400 ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
            placeholder={
              selectedShortcut
                ? ''
                : attachedFiles.length > 0
                  ? 'Add a message (optional)...'
                  : 'What can I help you with?'
            }
            aria-label="Message input"
          />
        </div>

        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleFileSelect}
              disabled={disabled}
              aria-label="Attach files"
              title="Attach text files (txt, md, json, csv, etc.)"
              className={`rounded-lg p-1.5 transition-colors ${disabled ? 'cursor-not-allowed opacity-50' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}>
              <Paperclip size={15} />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.md,.markdown,.json,.csv,.log,.xml,.yaml,.yml"
              onChange={handleFileChange}
              className="hidden"
              aria-hidden="true"
            />
          </div>

          {(costData || elapsedTime) && (
            <CostDisplay
              totalInputTokens={costData?.totalInputTokens ?? 0}
              totalOutputTokens={costData?.totalOutputTokens ?? 0}
              estimatedCostUsd={costData?.estimatedCostUsd ?? 0}
              elapsedTime={elapsedTime}
            />
          )}

          <div className="flex items-center gap-1.5">
            {onMicClick && (
              <button
                type="button"
                onClick={onMicClick}
                disabled={disabled}
                aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
                className={`relative rounded-lg p-1.5 transition-colors ${
                  disabled
                    ? 'cursor-not-allowed opacity-50'
                    : isRecording
                      ? 'bg-red-100 text-red-500 hover:bg-red-200'
                      : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}>
                {isRecording && <span className="absolute inset-0 animate-voice-pulse rounded-lg bg-red-400" />}
                <Mic size={16} strokeWidth={2} className="relative" />
              </button>
            )}

            {renderActionButton()}
          </div>
        </div>
      </div>
      <p className="mt-1.5 text-center text-[11px] text-gray-400/80">AI may produce inaccurate information</p>
    </div>
  );
}
