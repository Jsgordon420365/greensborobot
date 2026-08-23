import { useEffect } from 'react';
import { useAppStore } from '../app/store';

/**
 * Re-evaluates the household on a slow interval so a real deadline creeps up
 * without the user reloading. Deliberately gentle: escalation is measured in
 * minutes and hours, not frames.
 */
export function useLiveClock(intervalMs = 60_000): void {
  const identity = useAppStore((s) => s.identity);
  const refresh = useAppStore((s) => s.refresh);

  useEffect(() => {
    if (!identity) return;
    const timer = setInterval(() => void refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [identity, refresh, intervalMs]);
}
