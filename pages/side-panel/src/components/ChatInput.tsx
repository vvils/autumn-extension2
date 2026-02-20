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

const CHIP_ATTR = 'data-shortcut-chip';

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

function getPlainText(el: HTMLElement): string {
  let result = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent ?? '';
    } else if (node instanceof HTMLElement && node.hasAttribute(CHIP_ATTR)) {
      result += `/${node.getAttribute(CHIP_ATTR)}`;
    } else if (node instanceof HTMLElement) {
      if (node.tagName === 'BR') {
        result += '\n';
      } else {
        result += getPlainText(node);
      }
    }
  }
  return result;
}

function getCursorOffset(container: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return -1;
  const range = sel.getRangeAt(0);
  const preRange = document.createRange();
  preRange.selectNodeContents(container);
  preRange.setEnd(range.startContainer, range.startOffset);
  const tempDiv = document.createElement('div');
  tempDiv.appendChild(preRange.cloneContents());

  let offset = 0;
  const walk = (el: Node) => {
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        offset += node.textContent?.length ?? 0;
      } else if (node instanceof HTMLElement && node.hasAttribute(CHIP_ATTR)) {
        offset += `/${node.getAttribute(CHIP_ATTR)}`.length;
      } else if (node instanceof HTMLElement) {
        if (node.tagName === 'BR') {
          offset += 1;
        } else {
          walk(node);
        }
      }
    }
  };
  walk(tempDiv);
  return offset;
}

function createChipSpan(command: string): HTMLSpanElement {
  const chip = document.createElement('span');
  chip.setAttribute(CHIP_ATTR, command);
  chip.contentEditable = 'false';
  chip.className =
    'bg-accent-soft text-accent-foreground inline-block rounded-md px-1.5 py-0 text-[13px] font-medium leading-relaxed mx-0.5 cursor-pointer align-baseline';
  chip.textContent = `/${command}`;
  return chip;
}

function insertChipInEditable(container: HTMLElement, globalOffset: number, queryLength: number, command: string) {
  // queryLength includes the leading '/'
  const removeStart = globalOffset - queryLength - 1;
  const removeEnd = globalOffset;

  let currentOffset = 0;
  let startNode: Text | null = null;
  let startLocalOffset = 0;
  let endNode: Text | null = null;
  let endLocalOffset = 0;

  const walk = (parent: Node) => {
    for (const node of Array.from(parent.childNodes)) {
      if (startNode && endNode) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const len = node.textContent?.length ?? 0;
        if (!startNode && currentOffset + len > removeStart) {
          startNode = node as Text;
          startLocalOffset = removeStart - currentOffset;
        }
        if (!endNode && currentOffset + len >= removeEnd) {
          endNode = node as Text;
          endLocalOffset = removeEnd - currentOffset;
        }
        currentOffset += len;
      } else if (node instanceof HTMLElement && node.hasAttribute(CHIP_ATTR)) {
        const chipLen = `/${node.getAttribute(CHIP_ATTR)}`.length;
        currentOffset += chipLen;
      } else if (node instanceof HTMLElement) {
        if (node.tagName === 'BR') {
          currentOffset += 1;
        } else {
          walk(node);
        }
      }
    }
  };
  walk(container);

  if (!startNode || !endNode) return;

  const sNode: Text = startNode;
  const eNode: Text = endNode;
  const chip = createChipSpan(command);

  const afterText = eNode.textContent?.slice(endLocalOffset) ?? '';
  const beforeText = sNode.textContent?.slice(0, startLocalOffset) ?? '';

  if (sNode === eNode) {
    const parent = sNode.parentNode!;
    sNode.textContent = beforeText;
    const afterNode = document.createTextNode(afterText || '\u00A0');
    parent.insertBefore(chip, sNode.nextSibling);
    parent.insertBefore(afterNode, chip.nextSibling);

    const sel = window.getSelection();
    if (sel) {
      const newRange = document.createRange();
      newRange.setStart(afterNode, afterText ? 0 : 1);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
  } else {
    sNode.textContent = beforeText;
    const parent = sNode.parentNode!;

    let current = sNode.nextSibling;
    while (current && current !== eNode) {
      const next = current.nextSibling;
      parent.removeChild(current);
      current = next;
    }

    eNode.textContent = afterText || '\u00A0';
    parent.insertBefore(chip, eNode);

    const sel = window.getSelection();
    if (sel) {
      const newRange = document.createRange();
      newRange.setStart(eNode, afterText ? 0 : 1);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
  }
}

interface ChipInfo {
  command: string;
}

function getChipsFromEditable(el: HTMLElement): ChipInfo[] {
  const chips: ChipInfo[] = [];
  for (const node of Array.from(el.childNodes)) {
    if (node instanceof HTMLElement && node.hasAttribute(CHIP_ATTR)) {
      const command = node.getAttribute(CHIP_ATTR)!;
      chips.push({ command });
    }
  }
  return chips;
}

function clearEditable(el: HTMLElement) {
  el.textContent = '';
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
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [shortcutQuery, setShortcutQuery] = useState('');
  const [selectedShortcutIndex, setSelectedShortcutIndex] = useState(0);
  const [shortcuts, setShortcuts] = useState<SavedShortcut[]>([]);
  const [selectedShortcut, setSelectedShortcut] = useState<SavedShortcut | null>(null);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [slashTriggerIndex, setSlashTriggerIndex] = useState<number | null>(null);
  const [hasContent, setHasContent] = useState(false);

  // Map of chip command -> full shortcut data (populated when a shortcut is selected)
  const chipDataRef = useRef<Map<string, { id: string; command: string; prompt: string }>>(new Map());

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
    () => disabled || (!hasContent && attachedFiles.length === 0 && !selectedShortcut),
    [disabled, hasContent, attachedFiles, selectedShortcut],
  );

  const editableRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resizeInput = useCallback(() => {
    const el = editableRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }, []);

  const updateHasContent = useCallback(() => {
    const el = editableRef.current;
    if (!el) return;
    const text = getPlainText(el).trim();
    setHasContent(text.length > 0);
  }, []);

  const recheckShortcutContext = useCallback(() => {
    const el = editableRef.current;
    if (!el) return;
    const text = getPlainText(el);
    const cursorPos = getCursorOffset(el);
    if (cursorPos < 0) return;
    const ctx = getShortcutContext(text, cursorPos);
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

  const handleInput = useCallback(() => {
    resizeInput();
    updateHasContent();
    recheckShortcutContext();
  }, [resizeInput, updateHasContent, recheckShortcutContext]);

  useEffect(() => {
    if (setContent) {
      setContent((text: string) => {
        const el = editableRef.current;
        if (el) {
          clearEditable(el);
          el.textContent = text;
          updateHasContent();
          resizeInput();
        }
      });
    }
  }, [setContent, updateHasContent, resizeInput]);

  useEffect(() => {
    if (setShortcutActions) {
      setShortcutActions({
        updateShortcut: (command: string, prompt: string) => {
          setSelectedShortcut(prev => (prev ? { ...prev, command, prompt } : null));
          setEditedPrompt(prompt);
          // Also update chip data for inline chips
          chipDataRef.current.set(command, { id: command, command, prompt });
        },
        clearShortcut: () => {
          setSelectedShortcut(null);
          setEditedPrompt('');
        },
      });
    }
  }, [setShortcutActions]);

  const handleSubmit = useCallback(() => {
    const el = editableRef.current;

    // External chip flow (shortcut at position 0 with no surrounding text, or selected via dropdown for standalone)
    if (selectedShortcut) {
      const promptToSend = editedPrompt || selectedShortcut.prompt;
      const plainText = el ? getPlainText(el).trim() : '';
      const messageContent = plainText ? `${promptToSend}\n\n${plainText}` : promptToSend;
      const displayContent = plainText ? `/${selectedShortcut.command} ${plainText}` : `/${selectedShortcut.command}`;
      onSendMessage(messageContent, displayContent, {
        command: selectedShortcut.command,
        prompt: promptToSend,
      });
      if (el) clearEditable(el);
      setSelectedShortcut(null);
      setEditedPrompt('');
      setAttachedFiles([]);
      setHasContent(false);
      chipDataRef.current.clear();
      resizeInput();
      return;
    }

    if (!el) return;

    // Inline chip flow: extract chips and surrounding text
    const chips = getChipsFromEditable(el);
    const plainText = getPlainText(el).trim();

    if (chips.length > 0) {
      const chipShortcut = chipDataRef.current.get(chips[0].command);
      if (chipShortcut) {
        const promptToSend = chipShortcut.prompt;
        const commandPattern = `/${chipShortcut.command}`;
        const userText = plainText.replace(commandPattern, '').trim();
        const messageContent = userText ? `${promptToSend}\n\n${userText}` : promptToSend;
        onSendMessage(messageContent, plainText, {
          command: chipShortcut.command,
          prompt: promptToSend,
        });
        clearEditable(el);
        setAttachedFiles([]);
        setHasContent(false);
        chipDataRef.current.clear();
        resizeInput();
        return;
      }
    }

    if (plainText || attachedFiles.length > 0) {
      let messageContent = plainText;
      let displayContent = plainText;

      if (attachedFiles.length > 0) {
        const fileContents = attachedFiles
          .map(file => {
            return `\n\n<nano_file_content type="file" name="${file.name}">\n${file.content}\n</nano_file_content>`;
          })
          .join('\n');

        messageContent = plainText
          ? `${plainText}\n\n<nano_attached_files>${fileContents}</nano_attached_files>`
          : `<nano_attached_files>${fileContents}</nano_attached_files>`;

        const fileList = attachedFiles.map(file => `📎 ${file.name}`).join('\n');
        displayContent = plainText ? `${plainText}\n\n${fileList}` : fileList;
      }

      onSendMessage(messageContent, displayContent);
      clearEditable(el);
      setAttachedFiles([]);
      setHasContent(false);
      chipDataRef.current.clear();
      resizeInput();
    }
  }, [attachedFiles, selectedShortcut, editedPrompt, onSendMessage, resizeInput]);

  const handleCreateShortcutFromDropdown = useCallback(() => {
    setShowShortcuts(false);
    setSlashTriggerIndex(null);
    if (editableRef.current) clearEditable(editableRef.current);
    setHasContent(false);
    onCreateShortcut?.();
  }, [onCreateShortcut]);

  const handleShortcutSelect = useCallback(
    (shortcut: SavedShortcut) => {
      if (slashTriggerIndex === null) return;
      const el = editableRef.current;
      if (!el) return;

      const plainText = getPlainText(el);
      const beforeSlash = plainText.slice(0, slashTriggerIndex);
      const hasTextAround =
        beforeSlash.trim().length > 0 ||
        plainText.slice(slashTriggerIndex + 1 + shortcutQuery.length).trim().length > 0;

      chipDataRef.current.set(shortcut.command, {
        id: shortcut.id,
        command: shortcut.command,
        prompt: shortcut.prompt,
      });

      if (hasTextAround) {
        // Inline chip: insert chip span at the cursor position
        const cursorPos = slashTriggerIndex + 1 + shortcutQuery.length;
        insertChipInEditable(el, cursorPos, shortcutQuery.length, shortcut.command);
        setShowShortcuts(false);
        setSlashTriggerIndex(null);
        updateHasContent();
        resizeInput();
        el.focus();
      } else {
        // Standalone: external chip (same as before)
        setSelectedShortcut(shortcut);
        setEditedPrompt(shortcut.prompt);
        clearEditable(el);
        setHasContent(false);
        setShowShortcuts(false);
        setSlashTriggerIndex(null);
        resizeInput();
        requestAnimationFrame(() => el.focus());
      }
    },
    [slashTriggerIndex, shortcutQuery, updateHasContent, resizeInput],
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
      if (e.key === 'Backspace' && selectedShortcut) {
        const el = editableRef.current;
        const text = el ? getPlainText(el).trim() : '';
        if (text === '') {
          e.preventDefault();
          setSelectedShortcut(null);
          setEditedPrompt('');
          return;
        }
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
      handleCreateShortcutFromDropdown,
      maxDropdownIndex,
      onCreateShortcut,
    ],
  );

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  const handleChipClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const chip = target.closest(`[${CHIP_ATTR}]`) as HTMLElement | null;
      if (!chip) return;
      const command = chip.getAttribute(CHIP_ATTR);
      if (!command) return;
      const shortcut = chipDataRef.current.get(command);
      if (shortcut && onEditShortcut) {
        onEditShortcut(shortcut);
      }
    },
    [onEditShortcut],
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

  const placeholder = selectedShortcut
    ? ''
    : attachedFiles.length > 0
      ? 'Add a message (optional)...'
      : 'What can I help you with?';

  const renderActionButton = () => {
    if (showStopButton) {
      return (
        <button
          type="button"
          onClick={onStopTask}
          className="rounded-lg bg-accent p-1.5 text-white transition-colors hover:bg-accent-hover"
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
      <style>{`[contenteditable][data-placeholder]:empty::before { content: attr(data-placeholder); color: #9ca3af; pointer-events: none; }`}</style>
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
          <div
            ref={editableRef}
            contentEditable={!disabled}
            role="textbox"
            tabIndex={disabled ? -1 : 0}
            aria-label="Message input"
            aria-disabled={disabled}
            suppressContentEditableWarning
            data-placeholder={placeholder}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onKeyUp={(e: React.KeyboardEvent) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Escape') return;
              recheckShortcutContext();
            }}
            onClick={(e: React.MouseEvent) => {
              handleChipClick(e);
              recheckShortcutContext();
            }}
            onPaste={handlePaste}
            onBlur={() => {
              setShowShortcuts(false);
              setSlashTriggerIndex(null);
            }}
            className={`max-h-[200px] min-h-[24px] w-full resize-none overflow-y-auto whitespace-pre-wrap break-words bg-transparent text-[13px] leading-relaxed text-gray-900 outline-none ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
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
