import { useEffect } from 'react';
import { useAppStore } from '../app/store';
import { getRepository } from '../services';
import { logger } from '../lib/logger';

/**
 * Keeps this session in step with changes made elsewhere.
 *
 * In Connected Mode that means Supabase Realtime; in Local Demonstration Mode
 * it means the `storage` event, which fires in *other* tabs. Either way an
 * action taken in one session repaints the other. The subscription is torn
 * down on unmount, which matters because Realtime channels are a real resource.
 */
export function useHouseholdSync(): void {
  const identity = useAppStore((s) => s.identity);
  const refresh = useAppStore((s) => s.refresh);

  useEffect(() => {
    if (!identity) return;
    const unsubscribe = getRepository().subscribe(identity.id, () => {
      logger.debug('realtime.change', 'Refreshing after an external change', {
        ownerId: identity.id,
      });
      void refresh();
    });
    return unsubscribe;
  }, [identity, refresh]);
}
