import { useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsKeys } from '../../api/queryKeys.js';

/**
 * The server's warm-up snapshot as the project list last reported it:
 * `{active, projectsDone, projectsTotal, currentProjectName}` (see
 * services/warmup.py snapshot), or null before the first list or when the
 * server sent none. The list writes it (hooks/useProjectState.js) on every
 * fetch, and the list polls every few seconds while any card is pending or
 * this snapshot says the warm-up is active: no request of its own.
 */

/**
 * True while the last recorded snapshot says the server is still rebuilding
 * scores. The list's poll cadence asks this so it keeps re-asking (and so
 * keeps recording) until the warm-up finishes, not only while a card is
 * pending: the worker writes a project's card summary first and spends the
 * rest of its time on scores, so pending cards end long before the queue.
 * @param {import('@tanstack/react-query').QueryClient} queryClient
 * @returns {boolean}
 */
export function warmupIsActive(queryClient) {
  return queryClient.getQueryData(projectsKeys.warmup())?.active === true;
}

/**
 * Record the snapshot that rode on a project list response.
 * @param {import('@tanstack/react-query').QueryClient} queryClient
 * @param {Object|null} warmup
 */
export function recordWarmupSnapshot(queryClient, warmup) {
  queryClient.setQueryData(projectsKeys.warmup(), warmup ?? null);
}

/** @returns {Object|null} the last recorded snapshot; re-renders when the list records a new one */
export function useWarmupSnapshot() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: projectsKeys.warmup(),
    // Never fetched: the list route records it. The initial read is the
    // cache's current value so a strip mounted after the first list sees it.
    queryFn: () => queryClient.getQueryData(projectsKeys.warmup()) ?? null,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return data ?? null;
}
