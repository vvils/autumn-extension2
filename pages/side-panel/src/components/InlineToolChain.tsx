import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { ShimmerText } from './ShimmerText';
import type { ToolChainSegment, ThinkingAction } from '../hooks/useThinkingState';

interface InlineToolChainProps {
  segment: ToolChainSegment;
  defaultExpanded?: boolean;
}

function ChainStep({ action, isLast }: { action: ThinkingAction; isLast: boolean }) {
  const isRunning = action.status === 'running';

  const content = (
    <div className="flex relative z-10 gap-3 items-center w-full text-left">
      <div className="grid relative place-items-center size-4 shrink-0">
        <div className="rounded-full size-1.5 bg-neutral-400 shadow-[0_0_2px_6px_#FAFAFA]" />
      </div>
      {isRunning ? (
        <ShimmerText text={action.label} className="flex-1 truncate text-sm" />
      ) : (
        <span className="flex-1 truncate text-sm text-neutral-500">{action.label}</span>
      )}
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

  const actionCount = segment.actions.length;
  const headerText = segment.isActive ? 'Using tools' : `Used ${actionCount} tool${actionCount !== 1 ? 's' : ''}`;

  return (
    <div className="max-w-prose">
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="inline-flex items-center gap-0.5 text-sm cursor-pointer text-neutral-400">
        <ChevronRight
          size={12}
          className={`text-neutral-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
        />
        <span className="text-neutral-500">{headerText}</span>
      </button>

      {actionCount > 0 && (
        <div
          className="grid transition-[grid-template-rows] duration-200 ease-out"
          style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}>
          <div className="overflow-hidden">
            <div className="h-2" />
            <div className="flex relative flex-col gap-5">
              <div className="absolute left-[8px] bottom-3 top-3 -mx-px w-0.5 bg-gradient-to-b from-neutral-200 from-90% to-transparent" />
              {segment.actions.map((action, index) => (
                <ChainStep key={action.id} action={action} isLast={index === actionCount - 1} />
              ))}
            </div>
            <div className="h-2" />
          </div>
        </div>
      )}
    </div>
  );
}
