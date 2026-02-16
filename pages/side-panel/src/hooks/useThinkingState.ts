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

export interface ThinkingState {
  isActive: boolean;
  activeActor: Actors | null;
  actions: ThinkingAction[];
  stepInfo: { step: number; maxSteps: number } | null;
}

const INITIAL_STATE: ThinkingState = {
  isActive: false,
  activeActor: null,
  actions: [],
  stepInfo: null,
};

const GRACE_PERIOD_MS = 800;

let actionCounter = 0;

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
      setState(prev => ({ ...prev, isActive: false, activeActor: null }));
      graceTimerRef.current = null;
    }, GRACE_PERIOD_MS);
  }, [clearGraceTimer]);

  const reset = useCallback(() => {
    clearGraceTimer();
    actionCounter = 0;
    setState(INITIAL_STATE);
  }, [clearGraceTimer]);

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      const { actor, state: eventState, data } = event;

      switch (eventState) {
        case ExecutionState.TASK_START:
          clearGraceTimer();
          actionCounter = 0;
          setState({ isActive: true, activeActor: null, actions: [], stepInfo: null });
          break;

        case ExecutionState.STEP_START:
          clearGraceTimer();
          setState(prev => ({
            ...prev,
            isActive: true,
            activeActor: actor as Actors,
            stepInfo: data ? { step: data.step + 1, maxSteps: data.maxSteps } : prev.stepInfo,
          }));
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
              actions: [...prev.actions, newAction],
            }));
          }
          break;

        case ExecutionState.ACT_OK:
          setState(prev => ({
            ...prev,
            actions: markLatestRunning(prev.actions, 'done'),
          }));
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
          setState(prev => ({ ...prev, isActive: false, activeActor: null }));
          break;
      }
    },
    [clearGraceTimer, deactivateWithGrace],
  );

  return { state, handleEvent, reset };
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
