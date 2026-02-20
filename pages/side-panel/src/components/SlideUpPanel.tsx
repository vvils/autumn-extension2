import { useEffect, useRef } from 'react';
import { Zap, Plus, Globe } from 'lucide-react';
import type { SavedShortcut } from '@extension/storage';
import type { WorkflowPrompt } from '../constants/workflowPrompts';

export type SlideUpMode =
  | { kind: 'hidden' }
  | { kind: 'quickstart'; prompts: readonly WorkflowPrompt[]; shortcuts: SavedShortcut[] }
  | { kind: 'tabs'; tabs: chrome.tabs.Tab[]; query: string; selectedIndex: number }
  | { kind: 'shortcuts'; shortcuts: SavedShortcut[]; selectedIndex: number; showCreate: boolean };

interface SlideUpPanelProps {
  mode: SlideUpMode;
  onShortcutSelect: (shortcut: SavedShortcut) => void;
  onQuickstartSelect: (prompt: WorkflowPrompt) => void;
  onQuickShortcutSelect: (shortcut: SavedShortcut) => void;
  onTabSelect: (tab: chrome.tabs.Tab) => void;
  onCreateShortcut?: () => void;
}

export function SlideUpPanel({
  mode,
  onShortcutSelect,
  onQuickstartSelect,
  onQuickShortcutSelect,
  onTabSelect,
  onCreateShortcut,
}: SlideUpPanelProps) {
  const selectedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [mode]);

  const isVisible = mode.kind !== 'hidden';

  return (
    <div
      className={`grid transition-[grid-template-rows] duration-[250ms] ease-[cubic-bezier(0.4,1,0.05,1)] ${isVisible ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
      <div className="overflow-hidden">
        {/* eslint-disable-next-line tailwindcss/no-custom-classname */}
        <div className="no-scrollbar max-h-[276px] overflow-y-auto pb-1.5" role="listbox">
          {mode.kind === 'quickstart' && (
            <QuickstartContent
              prompts={mode.prompts}
              shortcuts={mode.shortcuts}
              onPromptSelect={onQuickstartSelect}
              onShortcutSelect={onQuickShortcutSelect}
            />
          )}
          {mode.kind === 'shortcuts' && (
            <ShortcutsContent
              shortcuts={mode.shortcuts}
              selectedIndex={mode.selectedIndex}
              showCreate={mode.showCreate}
              onSelect={onShortcutSelect}
              onCreateShortcut={onCreateShortcut}
              selectedRef={selectedRef}
            />
          )}
          {mode.kind === 'tabs' && (
            <TabsContent
              tabs={mode.tabs}
              selectedIndex={mode.selectedIndex}
              onSelect={onTabSelect}
              selectedRef={selectedRef}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function QuickstartContent({
  prompts,
  shortcuts,
  onPromptSelect,
  onShortcutSelect,
}: {
  prompts: readonly WorkflowPrompt[];
  shortcuts: SavedShortcut[];
  onPromptSelect: (p: WorkflowPrompt) => void;
  onShortcutSelect: (s: SavedShortcut) => void;
}) {
  return (
    <div className="flex flex-col-reverse">
      {prompts.map(wp => (
        <div
          key={wp.id}
          role="option"
          aria-selected={false}
          tabIndex={-1}
          onMouseDown={e => e.preventDefault()}
          onClick={() => onPromptSelect(wp)}
          onKeyDown={e => {
            if (e.key === 'Enter') onPromptSelect(wp);
          }}
          className="block w-full cursor-pointer rounded-[14px] opacity-65 transition-opacity duration-150 hover:bg-black/5 hover:opacity-100">
          <div className="w-full px-3 py-[8px] text-left text-[13px] font-normal text-black/90">
            {wp.icon} {wp.name}
          </div>
        </div>
      ))}
      {shortcuts.map(shortcut => (
        <div
          key={shortcut.id}
          role="option"
          aria-selected={false}
          tabIndex={-1}
          onMouseDown={e => e.preventDefault()}
          onClick={() => onShortcutSelect(shortcut)}
          onKeyDown={e => {
            if (e.key === 'Enter') onShortcutSelect(shortcut);
          }}
          className="block w-full cursor-pointer rounded-[14px] opacity-65 transition-opacity duration-150 hover:bg-black/5 hover:opacity-100">
          <div className="w-full px-3 py-[8px] text-left text-[13px] font-normal text-black/90">
            /{shortcut.command}
          </div>
        </div>
      ))}
    </div>
  );
}

function ShortcutsContent({
  shortcuts,
  selectedIndex,
  showCreate,
  onSelect,
  onCreateShortcut,
  selectedRef,
}: {
  shortcuts: SavedShortcut[];
  selectedIndex: number;
  showCreate: boolean;
  onSelect: (s: SavedShortcut) => void;
  onCreateShortcut?: () => void;
  selectedRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  const createIndex = shortcuts.length;

  if (shortcuts.length === 0 && !showCreate) return null;

  return (
    <div className="flex flex-col">
      {shortcuts.map((shortcut, index) => (
        <div
          key={shortcut.id}
          ref={
            index === selectedIndex
              ? el => {
                  selectedRef.current = el;
                }
              : undefined
          }
          role="option"
          aria-selected={index === selectedIndex}
          tabIndex={-1}
          onMouseDown={e => e.preventDefault()}
          onClick={() => onSelect(shortcut)}
          onKeyDown={e => {
            if (e.key === 'Enter') onSelect(shortcut);
          }}
          className={`flex w-full cursor-pointer items-center gap-2 rounded-[14px] px-3 py-[8px] text-left text-[13px] transition-colors ${
            index === selectedIndex ? 'bg-black/5' : 'opacity-65 hover:bg-black/5 hover:opacity-100'
          }`}>
          <Zap size={12} className="shrink-0 text-black/40" />
          <span className="font-medium text-black/90">/{shortcut.command}</span>
          <span className="truncate text-black/40">{shortcut.prompt}</span>
        </div>
      ))}
      {showCreate && onCreateShortcut && (
        <>
          {shortcuts.length > 0 && <div className="mx-3 border-t border-black/[0.06]" />}
          <div
            ref={
              createIndex === selectedIndex
                ? el => {
                    selectedRef.current = el;
                  }
                : undefined
            }
            role="option"
            aria-selected={createIndex === selectedIndex}
            tabIndex={-1}
            onMouseDown={e => e.preventDefault()}
            onClick={onCreateShortcut}
            onKeyDown={e => {
              if (e.key === 'Enter') onCreateShortcut();
            }}
            className={`flex w-full cursor-pointer items-center gap-2 rounded-[14px] px-3 py-[8px] text-left text-[13px] transition-colors ${
              createIndex === selectedIndex ? 'bg-black/5' : 'opacity-65 hover:bg-black/5 hover:opacity-100'
            }`}>
            <Plus size={12} className="shrink-0 text-black/40" />
            <span className="font-medium text-black/50">Create Shortcut</span>
          </div>
        </>
      )}
    </div>
  );
}

function TabsContent({
  tabs,
  selectedIndex,
  onSelect,
  selectedRef,
}: {
  tabs: chrome.tabs.Tab[];
  selectedIndex: number;
  onSelect: (t: chrome.tabs.Tab) => void;
  selectedRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  if (tabs.length === 0) {
    return <div className="px-3 py-2 text-[13px] text-black/40">No matching tabs</div>;
  }

  return (
    <div className="flex flex-col">
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          ref={
            index === selectedIndex
              ? el => {
                  selectedRef.current = el;
                }
              : undefined
          }
          role="option"
          aria-selected={index === selectedIndex}
          tabIndex={-1}
          onMouseDown={e => e.preventDefault()}
          onClick={() => onSelect(tab)}
          onKeyDown={e => {
            if (e.key === 'Enter') onSelect(tab);
          }}
          className={`flex w-full cursor-pointer items-center gap-2 rounded-[14px] px-3 py-[8px] text-left text-[13px] transition-colors ${
            index === selectedIndex ? 'bg-black/5' : 'opacity-65 hover:bg-black/5 hover:opacity-100'
          }`}>
          {tab.favIconUrl ? (
            <img
              src={tab.favIconUrl}
              alt=""
              className="size-[13px] shrink-0 rounded-sm"
              onError={e => {
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          {!tab.favIconUrl && <Globe size={13} className="shrink-0 text-black/40" />}
          {tab.favIconUrl && <Globe size={13} className="hidden shrink-0 text-black/40" />}
          <span className="truncate text-black/90">{tab.title || tab.url}</span>
        </div>
      ))}
    </div>
  );
}
