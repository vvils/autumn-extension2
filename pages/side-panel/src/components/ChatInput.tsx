import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Mic, Paperclip, Play, X, Globe, ThumbsUp, CircleHelp } from 'lucide-react';
import { shortcutSettingsStore, quickActionSettingsStore } from '@extension/storage';
import type { SavedShortcut, SavedQuickAction } from '@extension/storage';
import { CostDisplay } from './CostDisplay';
import type { CostDisplayProps } from './CostDisplay';
import { SlideUpPanel } from './SlideUpPanel';
import type { SlideUpMode } from './SlideUpPanel';
import type { CaptureResult } from '../utils/screenshotCapture';
import { FeedbackModal } from './FeedbackModal';
import { SupportModal } from './SupportModal';
import { Tooltip } from './Tooltip';
import { ConfirmToggle } from './ConfirmToggle';

export interface ShortcutActions {
  updateShortcut: (command: string, prompt: string) => void;
  clearShortcut: () => void;
}

interface ChatInputProps {
  onSendMessage: (
    text: string,
    displayText?: string,
    shortcuts?: Array<{ command: string; prompt: string }>,
    quickActionMeta?: { name: string; description: string; prompt: string },
  ) => void;
  onStopTask: () => void;
  onMicClick?: () => void;
  isRecording?: boolean;
  disabled: boolean;
  showStopButton: boolean;
  setContent?: (setter: (text: string) => void) => void;
  onEditShortcut?: (shortcut: { id: string; command: string; prompt: string }) => void;
  onCreateShortcut?: () => void;
  setShortcutActions?: (actions: ShortcutActions) => void;
  setFocusInput?: (fn: () => void) => void;
  historicalSessionId?: string | null;
  onReplay?: (sessionId: string) => void;
  costData?: CostDisplayProps | null;
  elapsedTime?: string | null;
  isInConversation?: boolean;
  onViewQuickAction?: (qa: { name: string; description: string; prompt: string }) => void;
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

function getAtContext(text: string, cursorPos: number): { atIndex: number; query: string } | null {
  for (let i = cursorPos - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === '@') {
      if (i === 0 || /\s/.test(text[i - 1])) {
        return { atIndex: i, query: text.slice(i + 1, cursorPos) };
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
  setFocusInput,
  historicalSessionId,
  onReplay,
  costData,
  elapsedTime,
  isInConversation = false,
  onViewQuickAction,
}: ChatInputProps) {
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [shortcutQuery, setShortcutQuery] = useState('');
  const [selectedShortcutIndex, setSelectedShortcutIndex] = useState(0);
  const [shortcuts, setShortcuts] = useState<SavedShortcut[]>([]);
  const [selectedShortcut, setSelectedShortcut] = useState<SavedShortcut | null>(null);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [, setSlashTriggerIndex] = useState<number | null>(null);
  const [hasContent, setHasContent] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const [openTabs, setOpenTabs] = useState<chrome.tabs.Tab[]>([]);
  const [tabQuery, setTabQuery] = useState('');
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);
  const [attachedTabs, setAttachedTabs] = useState<chrome.tabs.Tab[]>([]);
  const [atTriggerIndex, setAtTriggerIndex] = useState<number | null>(null);
  const [showTabPicker, setShowTabPicker] = useState(false);

  const [attachedScreenshot, setAttachedScreenshot] = useState<CaptureResult | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [quickActions, setQuickActions] = useState<SavedQuickAction[]>([]);
  const [selectedQuickAction, setSelectedQuickAction] = useState<SavedQuickAction | null>(null);

  useEffect(() => {
    shortcutSettingsStore.getSettings().then(s => setShortcuts(s.shortcuts));
    quickActionSettingsStore.getSettings().then(s => setQuickActions(s.quickActions));
  }, []);

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
    () =>
      disabled ||
      (!hasContent &&
        attachedFiles.length === 0 &&
        !selectedShortcut &&
        !selectedQuickAction &&
        attachedTabs.length === 0 &&
        !attachedScreenshot),
    [disabled, hasContent, attachedFiles, selectedShortcut, selectedQuickAction, attachedTabs, attachedScreenshot],
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
    const empty = text.length === 0;
    setHasContent(!empty);
    if (empty && el.innerHTML !== '') {
      el.innerHTML = '';
    }
  }, []);

  const fetchOpenTabs = useCallback(async () => {
    const tabs = await chrome.tabs.query({});
    setOpenTabs(tabs.filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://')));
  }, []);

  const recheckTriggerContext = useCallback(() => {
    const el = editableRef.current;
    if (!el) return;
    const text = getPlainText(el);
    const cursorPos = getCursorOffset(el);
    if (cursorPos < 0) return;

    const slashCtx = getShortcutContext(text, cursorPos);
    if (slashCtx) {
      setShowShortcuts(true);
      setShortcutQuery(slashCtx.query);
      setSlashTriggerIndex(slashCtx.slashIndex);
      setSelectedShortcutIndex(0);
      setAtTriggerIndex(null);
      return;
    }
    setShowShortcuts(false);
    setSlashTriggerIndex(null);

    const atCtx = getAtContext(text, cursorPos);
    if (atCtx) {
      setAtTriggerIndex(atCtx.atIndex);
      setTabQuery(atCtx.query);
      setSelectedTabIndex(0);
      fetchOpenTabs();
      return;
    }
    setAtTriggerIndex(null);
  }, [fetchOpenTabs]);

  const handleInput = useCallback(() => {
    resizeInput();
    updateHasContent();
    recheckTriggerContext();
  }, [resizeInput, updateHasContent, recheckTriggerContext]);

  useEffect(() => {
    if (setContent) {
      setContent((text: string) => {
        const el = editableRef.current;
        if (el) {
          el.textContent = '';
          el.textContent = text;
          updateHasContent();
          resizeInput();
        }
      });
    }
  }, [setContent, updateHasContent, resizeInput]);

  useEffect(() => {
    if (setFocusInput) {
      setFocusInput(() => editableRef.current?.focus());
    }
  }, [setFocusInput]);

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

  const filteredTabs = useMemo(() => {
    if (!tabQuery) return openTabs;
    const q = tabQuery.toLowerCase();
    return openTabs.filter(t => t.title?.toLowerCase().includes(q) || t.url?.toLowerCase().includes(q));
  }, [openTabs, tabQuery]);

  const slideUpMode: SlideUpMode = useMemo(() => {
    if (atTriggerIndex !== null || showTabPicker) {
      return {
        kind: 'tabs',
        tabs: filteredTabs,
        query: tabQuery,
        selectedIndex: selectedTabIndex,
      };
    }
    if (isInConversation) return { kind: 'hidden' };
    if (showShortcuts) {
      return {
        kind: 'shortcuts',
        shortcuts: filteredShortcuts,
        selectedIndex: effectiveIndex,
        showCreate: !!onCreateShortcut,
      };
    }
    if (
      isFocused &&
      !hasContent &&
      !selectedShortcut &&
      !selectedQuickAction &&
      !showStopButton &&
      !disabled &&
      quickActions.length > 0
    ) {
      return {
        kind: 'quickstart',
        prompts: quickActions,
      };
    }
    return { kind: 'hidden' };
  }, [
    isInConversation,
    showShortcuts,
    filteredShortcuts,
    effectiveIndex,
    onCreateShortcut,
    atTriggerIndex,
    showTabPicker,
    filteredTabs,
    tabQuery,
    selectedTabIndex,
    isFocused,
    hasContent,
    selectedShortcut,
    selectedQuickAction,
    showStopButton,
    disabled,
    quickActions,
  ]);

  const handleTabSelect = useCallback(
    (tab: chrome.tabs.Tab) => {
      setAttachedTabs(prev => {
        if (prev.some(t => t.id === tab.id)) return prev;
        return [...prev, tab];
      });

      const el = editableRef.current;
      if (el && atTriggerIndex !== null) {
        const text = getPlainText(el);
        const cursorPos = getCursorOffset(el);
        const before = text.slice(0, atTriggerIndex);
        const after = text.slice(cursorPos);
        el.textContent = before + after;

        const sel = window.getSelection();
        if (sel && el.firstChild) {
          const range = document.createRange();
          const pos = Math.min(before.length, el.firstChild.textContent?.length ?? 0);
          range.setStart(el.firstChild, pos);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }

      setAtTriggerIndex(null);
      setShowTabPicker(false);
      setTabQuery('');
      updateHasContent();
      resizeInput();
    },
    [atTriggerIndex, updateHasContent, resizeInput],
  );

  const handleRemoveTab = useCallback((tabId: number) => {
    setAttachedTabs(prev => prev.filter(t => t.id !== tabId));
  }, []);

  const handleSubmit = useCallback(() => {
    const el = editableRef.current;

    if (selectedShortcut) {
      const promptToSend = editedPrompt || selectedShortcut.prompt;
      const plainText = el ? getPlainText(el).trim() : '';
      const messageContent = plainText ? `${promptToSend}\n\n${plainText}` : promptToSend;
      const displayContent = plainText ? `/${selectedShortcut.command} ${plainText}` : `/${selectedShortcut.command}`;
      onSendMessage(messageContent, displayContent, [{ command: selectedShortcut.command, prompt: promptToSend }]);
      if (el) el.textContent = '';
      setSelectedShortcut(null);
      setEditedPrompt('');
      setAttachedFiles([]);
      setAttachedTabs([]);
      setAttachedScreenshot(null);
      setHasContent(false);
      resizeInput();
      return;
    }

    if (selectedQuickAction) {
      const plainText = el ? getPlainText(el).trim() : '';
      const messageContent = plainText ? `${selectedQuickAction.prompt}\n\n${plainText}` : selectedQuickAction.prompt;
      const displayContent = plainText ? `${selectedQuickAction.name} ${plainText}` : selectedQuickAction.name;
      onSendMessage(messageContent, displayContent, undefined, {
        name: selectedQuickAction.name,
        description: selectedQuickAction.description,
        prompt: selectedQuickAction.prompt,
      });
      if (el) el.textContent = '';
      setSelectedQuickAction(null);
      setAttachedFiles([]);
      setAttachedTabs([]);
      setAttachedScreenshot(null);
      setHasContent(false);
      resizeInput();
      return;
    }

    if (!el) return;

    const plainText = getPlainText(el).trim();

    if (!plainText && attachedFiles.length === 0 && attachedTabs.length === 0 && !attachedScreenshot) return;

    let messageContent = plainText;
    let displayContent = plainText;

    if (attachedTabs.length > 0) {
      const tabContext = attachedTabs.map(t => `- [${t.title || 'Untitled'}](${t.url})`).join('\n');
      messageContent = `Context tabs:\n${tabContext}\n\n${messageContent}`;
    }

    if (attachedScreenshot) {
      messageContent += `\n\n<nano_screenshot>${attachedScreenshot.croppedDataUrl}</nano_screenshot>`;
      displayContent = displayContent ? `${displayContent}\n\n📸 Screenshot attached` : '📸 Screenshot attached';
    }

    if (attachedFiles.length > 0) {
      const fileContents = attachedFiles
        .map(file => `\n\n<nano_file_content type="file" name="${file.name}">\n${file.content}\n</nano_file_content>`)
        .join('\n');

      messageContent = messageContent
        ? `${messageContent}\n\n<nano_attached_files>${fileContents}</nano_attached_files>`
        : `<nano_attached_files>${fileContents}</nano_attached_files>`;

      const fileList = attachedFiles.map(file => `📎 ${file.name}`).join('\n');
      displayContent = displayContent ? `${displayContent}\n\n${fileList}` : fileList;
    }

    onSendMessage(messageContent, displayContent);
    el.textContent = '';
    setAttachedFiles([]);
    setAttachedTabs([]);
    setAttachedScreenshot(null);
    setHasContent(false);
    resizeInput();
  }, [
    attachedFiles,
    attachedTabs,
    attachedScreenshot,
    selectedShortcut,
    selectedQuickAction,
    editedPrompt,
    onSendMessage,
    resizeInput,
  ]);

  const handleCreateShortcutFromDropdown = useCallback(() => {
    setShowShortcuts(false);
    setSlashTriggerIndex(null);
    if (editableRef.current) editableRef.current.textContent = '';
    setHasContent(false);
    onCreateShortcut?.();
  }, [onCreateShortcut]);

  const handleShortcutSelect = useCallback(
    (shortcut: SavedShortcut) => {
      setSelectedShortcut(shortcut);
      setEditedPrompt(shortcut.prompt);
      const el = editableRef.current;
      if (el) {
        el.textContent = '';
        setHasContent(false);
      }
      setShowShortcuts(false);
      setSlashTriggerIndex(null);
      resizeInput();
      requestAnimationFrame(() => el?.focus());
    },
    [resizeInput],
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

      if (atTriggerIndex !== null || showTabPicker) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedTabIndex(prev => Math.min(prev + 1, filteredTabs.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedTabIndex(prev => Math.max(0, prev - 1));
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setAtTriggerIndex(null);
          setShowTabPicker(false);
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (filteredTabs.length > 0) {
            handleTabSelect(filteredTabs[selectedTabIndex]);
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
      if (e.key === 'Backspace' && selectedQuickAction) {
        const el = editableRef.current;
        const text = el ? getPlainText(el).trim() : '';
        if (text === '') {
          e.preventDefault();
          setSelectedQuickAction(null);
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
      atTriggerIndex,
      showTabPicker,
      filteredTabs,
      selectedTabIndex,
      handleTabSelect,
      selectedQuickAction,
    ],
  );

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

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
        newFiles.push({ name: file.name, content, type: file.type || 'text/plain' });
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

  const handleQuickstartSelect = useCallback((qa: SavedQuickAction) => {
    setSelectedQuickAction(qa);
    const el = editableRef.current;
    if (el) {
      el.textContent = '';
      setHasContent(false);
    }
    requestAnimationFrame(() => el?.focus());
  }, []);

  const placeholder =
    selectedShortcut || selectedQuickAction
      ? ''
      : attachedFiles.length > 0 || attachedTabs.length > 0 || attachedScreenshot
        ? 'Write something …'
        : 'Ask anything, @ for tabs, / for shortcuts';

  return (
    <div className="shrink-0 px-3 pb-3 pt-1.5">
      <style>{`[contenteditable][data-placeholder]:empty::before { content: attr(data-placeholder); color: #9ca3af; pointer-events: none; }
.no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
.no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
      <div
        className="mx-auto flex w-full max-w-[550px] justify-center transition-shadow duration-150 ease-out"
        style={{
          borderRadius: 20,
          padding: 5.5,
          background:
            'radial-gradient(144.11% 100% at 50% 0%, rgba(255, 255, 255, 0.65) 0%, rgba(240, 240, 240, 0.4) 100%)',
          border: '1px solid rgba(0,0,0,0.07)',
          boxShadow: isFocused
            ? '0 1.5px 0 0 rgba(255,255,255,1) inset, 0 2px 0 0 rgba(255,255,255,1) inset, 0 0 18px 0 rgba(255,255,255,0.8) inset, 0 1px 2px 0 rgba(0,0,0,0.08), 0 4px 12px 0 rgba(0,0,0,0.05)'
            : '0 1.5px 0 0 rgba(255,255,255,1) inset, 0 2px 0 0 rgba(255,255,255,1) inset, 0 0 18px 0 rgba(255,255,255,0.8) inset, 0 1px 2px 0 rgba(0,0,0,0.05), 0 2px 6px 0 rgba(0,0,0,0.03)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
        onFocusCapture={() => setIsFocused(true)}
        onBlurCapture={(e: React.FocusEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsFocused(false);
            setShowTabPicker(false);
            setAtTriggerIndex(null);
            setShowShortcuts(false);
            setSlashTriggerIndex(null);
          }
        }}>
        <div className="w-full">
          <SlideUpPanel
            mode={slideUpMode}
            onShortcutSelect={handleShortcutSelect}
            onQuickstartSelect={handleQuickstartSelect}
            onTabSelect={handleTabSelect}
            onCreateShortcut={handleCreateShortcutFromDropdown}
          />
          <div
            className="relative w-full rounded-[14px] border border-[rgba(0,0,0,0.07)] bg-white pb-2.5 pl-2.5 pr-2.5 pt-2.5 transition-colors duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[rgba(0,0,0,0.1)]"
            style={{
              boxShadow: '0 1px 0 0 rgba(255,255,255,0.4) inset, 0 1px 4px 0 rgba(0,0,0,0.08)',
            }}>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  if (showTabPicker || atTriggerIndex !== null) {
                    setShowTabPicker(false);
                    setAtTriggerIndex(null);
                  } else {
                    fetchOpenTabs();
                    setShowTabPicker(true);
                  }
                }}
                disabled={disabled}
                className="flex h-[26px] items-center rounded-lg bg-[#5B5B5B15] px-2 text-[13px] opacity-80 transition-colors hover:bg-[#5B5B5B20] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Add tab context">
                <span className="font-medium text-black/60">@</span>
              </button>
              {attachedTabs.map(tab => (
                <div
                  key={tab.id}
                  className="flex h-[26px] items-center gap-1.5 rounded-lg bg-[#5B5B5B15] px-2 text-[13px] opacity-80 transition-colors hover:bg-[#5B5B5B20]">
                  {tab.favIconUrl ? (
                    <img src={tab.favIconUrl} alt="" className="size-[13px] shrink-0 rounded-sm" />
                  ) : (
                    <Globe size={13} className="shrink-0 text-black/40" />
                  )}
                  <span className="max-w-[120px] truncate text-black/70">{tab.title || 'Untitled'}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTab(tab.id!)}
                    className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-black/10"
                    aria-label={`Remove ${tab.title}`}>
                    <X size={10} />
                  </button>
                </div>
              ))}
              {attachedScreenshot && (
                <div className="flex h-[26px] items-center gap-1.5 rounded-lg bg-[#5B5B5B15] px-2 text-[13px] opacity-80 transition-colors hover:bg-[#5B5B5B20]">
                  <img
                    src={attachedScreenshot.croppedDataUrl}
                    alt="Screenshot"
                    className="h-[18px] shrink-0 rounded-sm"
                  />
                  <span className="text-black/70">Screenshot</span>
                  <button
                    type="button"
                    onClick={() => setAttachedScreenshot(null)}
                    className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-black/10"
                    aria-label="Remove screenshot">
                    <X size={10} />
                  </button>
                </div>
              )}
              {attachedFiles.map((file, index) => (
                <div
                  key={`file-${index}`}
                  className="flex h-[26px] items-center gap-1.5 rounded-lg bg-[#5B5B5B15] px-2 text-[13px] opacity-80 transition-colors hover:bg-[#5B5B5B20]">
                  <span className="max-w-[120px] truncate text-black/70">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(index)}
                    className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-black/10"
                    aria-label={`Remove ${file.name}`}>
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-1.5">
              {selectedShortcut && (
                <button
                  type="button"
                  onClick={() => onEditShortcut?.(selectedShortcut)}
                  className="shrink-0 rounded-md bg-black/[0.06] px-2 py-0.5 text-[13px] font-medium leading-relaxed text-black/60 transition-colors hover:bg-black/[0.1]">
                  /{selectedShortcut.command}
                </button>
              )}
              {selectedQuickAction && (
                <button
                  type="button"
                  onClick={() =>
                    onViewQuickAction?.({
                      name: selectedQuickAction.name,
                      description: selectedQuickAction.description,
                      prompt: selectedQuickAction.prompt,
                    })
                  }
                  className="shrink-0 rounded-md bg-black/[0.06] px-2 py-0.5 text-[13px] font-medium leading-relaxed text-black/60 transition-colors hover:bg-black/[0.1]">
                  {selectedQuickAction.name}
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
                onFocus={() => {
                  setShowTabPicker(false);
                  setAtTriggerIndex(null);
                }}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onKeyUp={(e: React.KeyboardEvent) => {
                  if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Escape') return;
                  recheckTriggerContext();
                }}
                onClick={() => {
                  setShowTabPicker(false);
                  setAtTriggerIndex(null);
                  recheckTriggerContext();
                }}
                onPaste={handlePaste}
                onBlur={() => {
                  setShowShortcuts(false);
                  setSlashTriggerIndex(null);
                  setAtTriggerIndex(null);
                  setShowTabPicker(false);
                }}
                className={`max-h-[200px] min-h-[44px] w-full resize-none overflow-y-auto whitespace-pre-wrap break-words bg-transparent text-[14px] leading-[1.75] text-black outline-none ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
              />
            </div>

            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <ConfirmToggle />
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
                <Tooltip label="Attach files" side="above">
                  <button
                    type="button"
                    onClick={handleFileSelect}
                    disabled={disabled}
                    aria-label="Attach files"
                    className={`rounded-lg p-1.5 transition-colors ${disabled ? 'cursor-not-allowed opacity-50' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}>
                    <Paperclip size={15} />
                  </button>
                </Tooltip>

                <Tooltip label="Send feedback" side="above">
                  <button
                    type="button"
                    onClick={() => setShowFeedbackModal(true)}
                    disabled={disabled}
                    aria-label="Send feedback"
                    className={`rounded-lg p-1.5 transition-colors ${disabled ? 'cursor-not-allowed opacity-50' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}>
                    <ThumbsUp size={15} />
                  </button>
                </Tooltip>

                <Tooltip label="Contact support" side="above">
                  <button
                    type="button"
                    onClick={() => setShowSupportModal(true)}
                    disabled={disabled}
                    aria-label="Contact support"
                    className={`rounded-lg p-1.5 transition-colors ${disabled ? 'cursor-not-allowed opacity-50' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}>
                    <CircleHelp size={15} />
                  </button>
                </Tooltip>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".txt,.md,.markdown,.json,.csv,.log,.xml,.yaml,.yml"
                  onChange={handleFileChange}
                  className="hidden"
                  aria-hidden="true"
                />

                {onMicClick && (
                  <Tooltip label="Voice input" side="above">
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
                  </Tooltip>
                )}

                {historicalSessionId && !hasContent ? (
                  <button
                    type="button"
                    onClick={handleReplay}
                    disabled={!historicalSessionId}
                    className="rounded-lg bg-green-500 p-1.5 text-white transition-colors hover:bg-green-600 disabled:opacity-30"
                    aria-label="Replay">
                    <Play size={14} fill="currentColor" strokeWidth={0} />
                  </button>
                ) : (
                  <div
                    className={`size-[30px] overflow-hidden rounded-[10px] transition-[box-shadow,opacity] duration-150 ${isSendButtonDisabled && !showStopButton ? 'bg-black opacity-35' : showStopButton ? 'bg-[#1a1a1a]' : 'bg-black'}`}
                    style={{
                      boxShadow: showStopButton ? '0 2px 4px 1px rgba(0,0,0,0.12)' : '0 1px 2px 0 rgba(0,0,0,0.10)',
                    }}>
                    <div
                      className="flex flex-col transition-transform duration-[220ms] ease-out"
                      style={{ transform: showStopButton ? 'translateY(-50%)' : 'translateY(0)' }}>
                      <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSendButtonDisabled}
                        className="flex size-[30px] items-center justify-center text-white"
                        aria-label="Send">
                        <svg width="14" height="14" viewBox="0 0 384 512" fill="currentColor">
                          <path d="M214.6 41.4c-12.5-12.5-32.8-12.5-45.3 0l-160 160c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L160 141.2V448c0 17.7 14.3 32 32 32s32-14.3 32-32V141.2l105.4 105.4c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-160-160z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={onStopTask}
                        className="flex size-[30px] items-center justify-center text-white"
                        aria-label="Stop">
                        <svg width="10" height="10" viewBox="0 0 384 512" fill="currentColor">
                          <path d="M0 128C0 92.7 28.7 64 64 64H320c35.3 0 64 28.7 64 64V384c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V128z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <FeedbackModal open={showFeedbackModal} onClose={() => setShowFeedbackModal(false)} />
      <SupportModal open={showSupportModal} onClose={() => setShowSupportModal(false)} />
    </div>
  );
}
