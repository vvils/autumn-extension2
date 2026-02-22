import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
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
import { ShimmerText } from './ShimmerText';
import type { ToolChainSegment, ThinkingAction } from '../hooks/useThinkingState';
import type { LucideIcon } from 'lucide-react';

interface InlineToolChainProps {
  segment: ToolChainSegment;
  defaultExpanded?: boolean;
}

const ACTOR_LABELS: Partial<Record<Actors, string>> = {
  [Actors.PLANNER]: 'Planner',
  [Actors.NAVIGATOR]: 'Navigator',
  [Actors.VALIDATOR]: 'Validator',
  [Actors.SYNTHESIZER]: 'Synthesizer',
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

function ShineBorder() {
  return (
    <div
      className="pointer-events-none absolute inset-0 rounded-[14px] animate-shine"
      style={
        {
          '--duration': '2s',
          padding: '1.5px',
          background: 'linear-gradient(135deg, #D87C3590, #FF00FF, #0066FF, #00FFFF)',
          backgroundSize: '255% 255%',
          mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          opacity: 0.4,
        } as React.CSSProperties
      }
    />
  );
}

function ChainStep({ action, isLast }: { action: ThinkingAction; isLast: boolean }) {
  const Icon = getActionIcon(action.label);

  const content = (
    <div className="flex items-center gap-2.5 py-1.5">
      <div className="relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full bg-neutral-50 shadow-[0_0_2px_6px_#FAFAFA]">
        <div className="size-1.5 rounded-full bg-neutral-300" />
      </div>
      <Icon size={13} className="shrink-0 text-neutral-400" />
      <span
        className={`flex-1 truncate text-[12px] ${action.status === 'running' ? 'text-neutral-400' : 'text-neutral-500'}`}>
        {action.label}
      </span>
      <StatusIndicator status={action.status} />
    </div>
  );

  if (isLast) {
    return (
      <motion.div
        initial={{ opacity: 0, filter: 'blur(10px)' }}
        animate={{ opacity: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.6, type: 'spring', bounce: 0 }}>
        {content}
      </motion.div>
    );
  }

  return content;
}

export default function InlineToolChain({ segment, defaultExpanded }: InlineToolChainProps) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? segment.isActive);
  const wasActiveRef = useRef(segment.isActive);

  useEffect(() => {
    if (wasActiveRef.current && !segment.isActive) {
      setExpanded(false);
    }
    wasActiveRef.current = segment.isActive;
  }, [segment.isActive]);

  const actorLabel = ACTOR_LABELS[segment.actor] ?? 'Agent';
  const actionCount = segment.actions.length;

  return (
    <div className="mx-auto w-full max-w-[550px]">
      <div
        className={`relative overflow-hidden rounded-[14px] border bg-white ${
          segment.isActive
            ? 'border-black/10 shadow-[0_2px_4px_0_rgba(0,0,0,0.03),_0_1px_0_0_rgba(255,255,255,0.60)_inset]'
            : 'border-black/[0.06]'
        }`}>
        {segment.isActive && <ShineBorder />}

        <button
          type="button"
          onClick={() => setExpanded(prev => !prev)}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[12px] transition-colors hover:bg-black/[0.02]">
          <span className="flex-1 font-medium">
            {segment.isActive ? (
              <ShimmerText text={`${actorLabel} is working`} />
            ) : (
              <span className="text-neutral-500">
                {actorLabel} used {actionCount} action{actionCount !== 1 ? 's' : ''}
              </span>
            )}
          </span>
          {actionCount > 0 && (
            <ChevronDown
              size={14}
              className={`shrink-0 text-neutral-400 transition-transform duration-200 ${expanded ? '' : '-rotate-90'}`}
            />
          )}
        </button>

        {actionCount > 0 && (
          <>
            <motion.div
              initial={false}
              animate={{ opacity: expanded ? 1 : 0 }}
              transition={{ duration: 0.15 }}
              className="mx-4 h-px bg-black/[0.06]"
            />

            <div
              className="grid transition-[grid-template-rows] duration-200 ease-out"
              style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}>
              <div className="overflow-hidden">
                <div className="relative px-4 pb-3 pt-2">
                  <div className="absolute left-[31px] bottom-3 top-5 w-0.5 bg-gradient-to-b from-neutral-200 from-90% to-transparent" />
                  {segment.actions.map((action, index) => (
                    <ChainStep key={action.id} action={action} isLast={index === actionCount - 1} />
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
