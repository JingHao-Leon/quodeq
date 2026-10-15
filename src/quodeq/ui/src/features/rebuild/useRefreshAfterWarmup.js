import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { projectKeys } from '../../api/queryKeys.js';
import { REBUILD_STATE, isBusyState } from './rebuildState.js';

/**
 * Drops the whole `project` query subtree once the warm-up queue finishes.
 *
 * A formula pass invalidates every project when it lands, but the warm-up
 * that follows is still rebuilding the score caches then: a screen that
 * refetched at that moment (Compare, History, the principle pages) built
 * its rows inline beside the worker, and a reply that timed out left the
 * old numbers on screen with nothing asking again. One more invalidation
 * when the queue drains refetches what is mounted now and marks the rest
 * stale for their next visit. A pass that ends without a warm-up after it
 * already invalidated, so only the end of a warm-up triggers this.
 * @param {string} kind The strip's current REBUILD_STATE.
 */
export function useRefreshAfterWarmup(kind) {
  const queryClient = useQueryClient();
  const previous = useRef(kind);
  useEffect(() => {
    const was = previous.current;
    previous.current = kind;
    if (was === REBUILD_STATE.WARMING && !isBusyState(kind)) {
      queryClient.invalidateQueries({ queryKey: projectKeys.all() });
    }
  }, [kind, queryClient]);
}
