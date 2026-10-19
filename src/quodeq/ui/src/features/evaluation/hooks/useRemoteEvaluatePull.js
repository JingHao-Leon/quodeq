import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { sharedKeys } from '../../../api/queryKeys.js';
import { anyActive } from '../../../api/syncStatus.js';
import { invalidateProjects } from '../../../hooks/invalidateProjects.js';
import { useSharedActions } from '../../dashboard/hooks/useSharedActions.js';
import { usePullToLocal } from '../../dashboard/hooks/usePullToLocal.js';
import { useSidePane } from '../../side-pane/index.js';
import { findProject } from '../../../utils/projectIdentity.js';
import { t } from '../../../strings/index.js';
import { NAV_TAB } from '../../../vocab/navTab.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';

const ACTIVE_MS = 1000;

// The status query as useSyncActivity reads it: polls only while a job runs,
// so an idle app makes no extra requests for this watcher.
function usePullSlot() {
  const { getSyncStatus } = useApi();
  const query = useQuery({
    queryKey: sharedKeys.status(),
    queryFn: getSyncStatus,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchInterval: (q) => (anyActive(q.state.data) ? ACTIVE_MS : false),
  });
  return { slot: query.data?.pull, refetch: query.refetch };
}

// Whether the person is still on the remote project's evaluate card.
function onCardFor(state, activeTab, projectId) {
  return activeTab === NAV_TAB.EVALUATE
    && state.selectedSource === PROJECT_SOURCE.SHARED
    && state.selectedProject === projectId;
}

// The local project a collision named, when it is in the projects list, and
// the action that evaluates it instead of pulling a copy (stays on Evaluate).
function useExistingLocal(pull, state) {
  const existing = pull.pullConflictExistingId;
  const existingId = existing && findProject(state.projects, existing) ? existing : null;
  const openExisting = (id) => {
    pull.cancelConflict(id);
    state.handleProjectChange?.(existingId, PROJECT_SOURCE.LOCAL);
  };
  return { existingId, openExisting };
}

/**
 * The pull a remote project's evaluate card starts, watched app-wide so it
 * still lands when the person leaves the card. When the local copy is in the
 * projects list: still on the card, the app selects it and stays on Evaluate
 * (the run does not start); elsewhere, a toast offers "evaluate" and nothing
 * moves under them. A failure off the card is toasted; on it, the card shows it.
 * A collision with a project already on this machine names it
 * (`pullConflictExistingId`, only when it is in the projects list), and
 * `openExisting` selects that one on Evaluate instead of pulling a copy.
 * @returns {{ pullingId: string|null, pullError: object|null, pullConflictId: string|null,
 *   pullConflictExistingId: string|null, start: Function, confirmCopy: Function,
 *   cancelConflict: Function, openExisting: Function }}
 */
export function useRemoteEvaluatePull({ state, activeTab, navTab }) {
  const { connectShared, startPull } = useApi();
  const { showToast } = useSidePane();
  const queryClient = useQueryClient();
  const { slot, refetch } = usePullSlot();
  const actions = useSharedActions({ connectShared, startPull });
  const shared = {
    pullSlot: slot,
    pull: async (id, action) => {
      const started = await actions.pull(id, action);
      await refetch(); // show the running job now; the active poll takes it from there
      return started;
    },
  };
  const pull = usePullToLocal({ shared });
  const [pendingId, setPendingId] = useState(null);
  const relisted = useRef(null);

  const finished = Boolean(pendingId) && pull.pulledIds.has(pendingId);
  const failedMessage = pendingId && pull.pullError?.projectId === pendingId ? pull.pullError.message : null;
  const localId = finished ? slot?.projectId : null;
  const landed = Boolean(localId) && Boolean(findProject(state.projects, localId));

  useEffect(() => {
    if (!failedMessage) return;
    setPendingId(null);
    if (!onCardFor(state, activeTab, pendingId)) {
      showToast(t('evaluate.remotePullFailed', { name: slot?.projectName || pendingId, message: failedMessage }));
    }
  }, [failedMessage]); // eslint-disable-line react-hooks/exhaustive-deps -- fires once per failure

  useEffect(() => {
    if (!finished || landed || relisted.current === pendingId) return;
    relisted.current = pendingId; // the pull made a local project: re-read the list once
    invalidateProjects(queryClient);
  }, [finished, landed, pendingId, queryClient]);

  useEffect(() => {
    if (!landed) return;
    const name = slot?.projectName || localId;
    setPendingId(null);
    const open = () => state.handleProjectChange?.(localId, PROJECT_SOURCE.LOCAL);
    if (onCardFor(state, activeTab, pendingId)) { open(); return; }
    showToast(t('evaluate.remotePullReady', { name }), {
      label: t('evaluate.remotePullOpen'),
      onClick: () => { open(); navTab(NAV_TAB.EVALUATE); },
    });
  }, [landed]); // eslint-disable-line react-hooks/exhaustive-deps -- fires once per landing

  const { existingId, openExisting } = useExistingLocal(pull, state);
  const start = useCallback((id) => { setPendingId(id); pull.handlePull(id); }, [pull.handlePull]);
  const confirmCopy = useCallback((id) => { setPendingId(id); pull.handleConfirmCopy(id); }, [pull.handleConfirmCopy]);
  return {
    pullingId: pull.pullingId, pullError: pull.pullError,
    pullConflictId: pull.pullConflictId, pullConflictExistingId: existingId,
    start, confirmCopy, cancelConflict: pull.cancelConflict, openExisting,
  };
}
