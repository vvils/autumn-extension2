import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Mic, Paperclip, ArrowUp, Square, Play, X } from 'lucide-react';
import { CostDisplay, type CostDisplayProps } from './CostDisplay';

interface ChatInputProps {
  onSendMessage: (text: string, displayText?: string) => void;
  onStopTask: () => void;
  onMicClick?: () => void;
  isRecording?: boolean;
  disabled: boolean;
  showStopButton: boolean;
  setContent?: (setter: (text: string) => void) => void;
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

export default function ChatInput({
  onSendMessage,
  onStopTask,
  onMicClick,
  isRecording = false,
  disabled,
  showStopButton,
  setContent,
  historicalSessionId,
  onReplay,
  costData,
  elapsedTime,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const isSendButtonDisabled = useMemo(
    () => disabled || (text.trim() === '' && attachedFiles.length === 0),
    [disabled, text, attachedFiles],
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
    setText(e.target.value);
    resizeTextarea();
  };

  useEffect(() => {
    if (setContent) {
      setContent(setText);
    }
  }, [setContent]);

  useEffect(() => {
    resizeTextarea();
  }, [text, resizeTextarea]);

  const handleSubmit = useCallback(() => {
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
  }, [text, attachedFiles, onSendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
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
    <div className="shrink-0 bg-white px-3 pb-3 pt-2">
      <div
        className={`rounded-2xl border border-gray-200 bg-white px-3.5 py-2.5 shadow-sm transition-all ${disabled ? '' : 'focus-within:border-accent/40 focus-within:ring-accent/20 focus-within:ring-2'}`}>
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

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-disabled={disabled}
          rows={1}
          className={`max-h-[200px] min-h-[24px] w-full resize-none bg-transparent text-[13px] leading-6 text-gray-900 outline-none placeholder:text-gray-400 ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
          placeholder={attachedFiles.length > 0 ? 'Add a message (optional)...' : 'What can I help you with?'}
          aria-label="Message input"
        />

        <div className="mt-1 flex items-center justify-between">
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
      <p className="mt-2 text-center text-[10px] text-gray-300">AI may produce inaccurate information</p>
    </div>
  );
}
