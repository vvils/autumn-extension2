import { useCallback, useEffect, useRef, useState } from 'react';
import { Actors } from '@extension/storage';
import { ExecutionState } from '../types/event';
import type { AgentEvent } from '../types/event';

export interface ThinkingAction {
  id: string;
  label: string;
  status: 'running' | 'done' | 'failed';
  timestamp: number;
}

export interface ToolChainSegment {
  id: string;
  actor: Actors;
  actions: ThinkingAction[];
  isActive: boolean;
  timestamp: number;
}

export interface ThinkingState {
  isActive: boolean;
  activeActor: Actors | null;
  actions: ThinkingAction[];
  stepInfo: { step: number; maxSteps: number } | null;
  completedChains: ToolChainSegment[];
}

const INITIAL_STATE: ThinkingState = {
  isActive: false,
  activeActor: null,
  actions: [],
  stepInfo: null,
  completedChains: [],
};

const GRACE_PERIOD_MS = 800;

let actionCounter = 0;
let chainCounter = 0;

function snapshotChain(prev: ThinkingState): ToolChainSegment | null {
  if (prev.actions.length === 0) return null;
  return {
    id: `chain-${++chainCounter}`,
    actor: prev.activeActor ?? Actors.NAVIGATOR,
    actions: prev.actions.map(a => (a.status === 'running' ? { ...a, status: 'done' as const } : a)),
    isActive: false,
    timestamp: prev.actions[0].timestamp,
  };
}

export function useThinkingState() {
  const [state, setState] = useState<ThinkingState>(INITIAL_STATE);
  const stateRef = useRef<ThinkingState>(INITIAL_STATE);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const clearGraceTimer = useCallback(() => {
    if (graceTimerRef.current) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
  }, []);

  const deactivateWithGrace = useCallback(() => {
    clearGraceTimer();
    graceTimerRef.current = setTimeout(() => {
      setState(prev => {
        const chain = snapshotChain(prev);
        return {
          ...prev,
          isActive: false,
          activeActor: null,
          actions: [],
          completedChains: chain ? [...prev.completedChains, chain] : prev.completedChains,
        };
      });
      graceTimerRef.current = null;
    }, GRACE_PERIOD_MS);
  }, [clearGraceTimer]);

  const reset = useCallback(() => {
    clearGraceTimer();
    actionCounter = 0;
    chainCounter = 0;
    setState(INITIAL_STATE);
  }, [clearGraceTimer]);

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      const { actor, state: eventState, data } = event;

      switch (eventState) {
        case ExecutionState.TASK_START:
          clearGraceTimer();
          actionCounter = 0;
          chainCounter = 0;
          setState({ isActive: true, activeActor: null, actions: [], stepInfo: null, completedChains: [] });
          break;

        case ExecutionState.STEP_START:
          clearGraceTimer();
          setState(prev => {
            const sameActor = prev.activeActor === (actor as Actors);
            const chain = sameActor ? null : snapshotChain(prev);
            return {
              ...prev,
              isActive: true,
              activeActor: actor as Actors,
              actions: sameActor ? prev.actions : [],
              stepInfo: data ? { step: data.step + 1, maxSteps: data.maxSteps } : prev.stepInfo,
              completedChains: chain ? [...prev.completedChains, chain] : prev.completedChains,
            };
          });
          break;

        case ExecutionState.ACT_START:
          if (actor === Actors.NAVIGATOR && data?.details !== 'cache_content') {
            const newAction: ThinkingAction = {
              id: `act-${++actionCounter}`,
              label: data?.details || 'Acting',
              status: 'running',
              timestamp: event.timestamp,
            };
            setState(prev => ({
              ...prev,
              isActive: true,
              actions: [...markAllRunning(prev.actions, 'done'), newAction],
            }));
          }
          break;

        case ExecutionState.ACT_OK:
          break;

        case ExecutionState.ACT_FAIL:
          setState(prev => ({
            ...prev,
            actions: markLatestRunning(prev.actions, 'failed'),
          }));
          break;

        case ExecutionState.STEP_OK:
        case ExecutionState.STEP_CANCEL:
          if (actor === (stateRef.current.activeActor as string) || actor === Actors.NAVIGATOR) {
            deactivateWithGrace();
          }
          break;

        case ExecutionState.TASK_OK:
        case ExecutionState.TASK_FAIL:
        case ExecutionState.TASK_CANCEL:
          clearGraceTimer();
          setState(prev => {
            const chain = snapshotChain(prev);
            return {
              ...prev,
              isActive: false,
              activeActor: null,
              actions: [],
              completedChains: chain ? [...prev.completedChains, chain] : prev.completedChains,
            };
          });
          break;
      }
    },
    [clearGraceTimer, deactivateWithGrace],
  );

  return { state, handleEvent, reset };
}

function markAllRunning(actions: ThinkingAction[], newStatus: 'done' | 'failed'): ThinkingAction[] {
  return actions.map(a => (a.status === 'running' ? { ...a, status: newStatus } : a));
}

function markLatestRunning(actions: ThinkingAction[], newStatus: 'done' | 'failed'): ThinkingAction[] {
  for (let i = actions.length - 1; i >= 0; i--) {
    if (actions[i].status === 'running') {
      const updated = [...actions];
      updated[i] = { ...updated[i], status: newStatus };
      return updated;
    }
  }
  return actions;
}
