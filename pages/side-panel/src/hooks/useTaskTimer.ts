import { useState, useRef, useCallback } from 'react';

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function useTaskTimer() {
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (startTimeRef.current !== null) {
      setElapsed(Date.now() - startTimeRef.current);
    }
  }, []);

  const start = useCallback(() => {
    stop();
    const now = Date.now();
    startTimeRef.current = now;
    setElapsed(0);
    intervalRef.current = window.setInterval(() => {
      setElapsed(Date.now() - now);
    }, 1000);
  }, [stop]);

  const reset = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    startTimeRef.current = null;
    setElapsed(0);
  }, []);

  const formattedTime = elapsed > 0 ? formatElapsed(elapsed) : null;

  return { formattedTime, start, stop, reset } as const;
}
