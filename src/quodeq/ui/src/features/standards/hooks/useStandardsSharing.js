import { useCallback, useMemo, useRef, useState } from 'react';
import { useApi } from '../../../api/ApiContext.jsx';
import { isSlotActive } from '../../../api/syncStatus.js';
import { useSyncStatus } from '../../../hooks/useSyncStatus.js';
import { useRefreshStart, useSharedConnection } from '../../dashboard/hooks/useSharedProjects.js';
import { useStandardSync } from './useStandardSync.js';
import { SYNC_PHASE } from '../../../vocab/syncPhase.js';

function countRemote(grouped) {
  if (!grouped) return 0;
  return Object.values(grouped).reduce(
    (sum, arr) => sum + (Array.isArray(arr) ? arr.filter((s) => s.remote).length : 0), 0,
  );
}

// One pull at a time: two clicks before the status poll reports the refresh
// job would otherwise start two. The ref guards synchronously, the state
// keeps the "pulling" label up until the start call settles.
function usePullInFlight(pull) {
  const busy = useRef(false);
  const [inFlight, setInFlight] = useState(false);
  const guarded = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setInFlight(true);
    try {
      await pull();
    } finally {
      busy.current = false;
      setInFlight(false);
    }
  }, [pull]);
  return { inFlight, pull: guarded };
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
export function useStandardsSharing({ grouped, refresh: refreshList }) {
  const { startRefresh } = useApi();
  const { configured, host } = useSharedConnection();
  const status = useSyncStatus();
  const sync = useStandardSync({ refresh: refreshList });
  const { startFailed, refresh } = useRefreshStart({ startRefresh, refetchStatus: status.refetch });
  const { inFlight, pull } = usePullInFlight(refresh);
  const remoteCount = useMemo(() => (configured ? countRemote(grouped) : 0), [configured, grouped]);
  if (!configured) return { band: null, shared: undefined, remoteCount: 0 };
  // A pull that could not start, or whose refresh job ended in error.
  const pullFailed = startFailed || status.refresh?.phase === SYNC_PHASE.ERROR;
  return {
    band: {
      host, lastSynced: status.lastSynced, onPull: pull, pullFailed,
      refreshing: inFlight || isSlotActive(status.refresh),
    },
    shared: { connected: true, sync },
    remoteCount,
  };
}
