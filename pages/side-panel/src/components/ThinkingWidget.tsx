import { useState } from 'react';
import {
  Brain,
  ChevronDown,
  Navigation,
  MousePointerClick,
  FormInput,
  ArrowDown,
  ArrowUp,
  Search,
  ArrowLeft,
  Clock,
  ExternalLink,
  Eye,
  Camera,
  Wrench,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import { Actors } from '@extension/storage';
import type { ThinkingState, ThinkingAction } from '../hooks/useThinkingState';
import type { LucideIcon } from 'lucide-react';

interface ThinkingWidgetProps {
  state: ThinkingState;
}

const ACTOR_LABELS: Partial<Record<Actors, string>> = {
  [Actors.PLANNER]: 'Planner',
  [Actors.NAVIGATOR]: 'Navigator',
  [Actors.VALIDATOR]: 'Validator',
};

const ICON_PATTERNS: [RegExp, LucideIcon][] = [
  [/navigat/i, Navigation],
  [/click/i, MousePointerClick],
  [/typ|input|fill/i, FormInput],
  [/scroll.*down/i, ArrowDown],
  [/scroll.*up/i, ArrowUp],
  [/search|google/i, Search],
  [/back/i, ArrowLeft],
  [/wait/i, Clock],
  [/tab/i, ExternalLink],
  [/read|extract/i, Eye],
  [/screenshot/i, Camera],
];

function getActionIcon(label: string): LucideIcon {
  for (const [pattern, icon] of ICON_PATTERNS) {
    if (pattern.test(label)) return icon;
  }
  return Wrench;
}

export default function ThinkingWidget({ state }: ThinkingWidgetProps) {
  const [expanded, setExpanded] = useState(true);

  if (!state.isActive && state.actions.length === 0) return null;

  const actorLabel = state.activeActor ? (ACTOR_LABELS[state.activeActor] ?? 'Agent') : 'Agent';
  const hasActions = state.actions.length > 0;

  return (
    <div className="mx-1 mb-2 shrink-0">
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-gray-500 transition-colors hover:bg-gray-50">
        {state.isActive ? (
          <Loader2 size={14} className="shrink-0 animate-spin text-gray-400" />
        ) : (
          <Brain size={14} className="shrink-0 text-gray-400" />
        )}
        <span className="flex-1 font-medium">
          {actorLabel} is thinking
          {state.stepInfo && (
            <span className="ml-1 font-normal text-gray-400">
              ({state.stepInfo.step}/{state.stepInfo.maxSteps})
            </span>
          )}
        </span>
        {state.isActive && <LoadingDots />}
        {hasActions && (
          <ChevronDown
            size={14}
            className={`shrink-0 text-gray-400 transition-transform duration-200 ${expanded ? '' : '-rotate-90'}`}
          />
        )}
      </button>

      {hasActions && (
        <div
          className="grid transition-[grid-template-rows] duration-200 ease-out"
          style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}>
          <div className="max-h-[120px] overflow-hidden overflow-y-auto">
            <div className="space-y-0.5 px-3 pb-1 pt-0.5">
              {state.actions.map((action, index) => (
                <ActionItem key={action.id} action={action} index={index} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="inline-block size-1 rounded-full bg-gray-400"
          style={{
            animation: 'loadingBounce 1.2s ease-in-out infinite',
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </span>
  );
}

function ActionItem({ action, index }: { action: ThinkingAction; index: number }) {
  const Icon = getActionIcon(action.label);

  return (
    <div
      className="flex animate-slide-in items-center gap-2 rounded px-1 py-0.5 text-[11px] text-gray-500"
      style={{ animationDelay: `${index * 30}ms` }}>
      <Icon size={12} className="shrink-0 text-gray-400" />
      <span className="flex-1 truncate">{action.label}</span>
      <StatusIndicator status={action.status} />
    </div>
  );
}

function StatusIndicator({ status }: { status: ThinkingAction['status'] }) {
  switch (status) {
    case 'done':
      return <Check size={11} className="shrink-0 text-emerald-500" />;
    case 'failed':
      return <X size={11} className="shrink-0 text-red-400" />;
    case 'running':
      return <Loader2 size={11} className="shrink-0 animate-spin text-gray-400" />;
  }
}
