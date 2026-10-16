import { useMemo } from 'react';
import { useApi } from '../../../api/ApiContext.jsx';
import { isSlotActive } from '../../../api/syncStatus.js';
import { useSyncStatus } from '../../../hooks/useSyncStatus.js';
import { useRefreshStart, useSharedConnection } from '../../dashboard/hooks/useSharedProjects.js';
import { useStandardSync } from './useStandardSync.js';

function countRemote(grouped) {
  if (!grouped) return 0;
  return Object.values(grouped).reduce(
    (sum, arr) => sum + (Array.isArray(arr) ? arr.filter((s) => s.remote).length : 0), 0,
  );
}

/**
 * The Standards page's view of the shared repository: the band above the
 * table, the `shared` prop the table reads, and how many standards exist only
 * remotely. Everything is null/undefined/0 while nothing is connected, so the
 * page looks exactly as it does without sharing.
 *
 * Pull starts the same background refresh as the Repositories strip; the
 * refresh job's DONE edge (useSyncStatus) re-lists the standards.
 */
export function useStandardsSharing({ grouped, refresh }) {
  const { startRefresh } = useApi();
  const { configured, host } = useSharedConnection();
  const status = useSyncStatus();
  const sync = useStandardSync({ refresh });
  const { refresh: pull } = useRefreshStart({ startRefresh, refetchStatus: status.refetch });
  const remoteCount = useMemo(() => (configured ? countRemote(grouped) : 0), [configured, grouped]);
  if (!configured) return { band: null, shared: undefined, remoteCount: 0 };
  return {
    band: { host, lastSynced: status.lastSynced, refreshing: isSlotActive(status.refresh), onPull: pull },
    shared: { connected: true, sync },
    remoteCount,
  };
}
