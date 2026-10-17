import { useState, useCallback } from 'react';
import { useApi } from '../../api/ApiContext.jsx';
import { useVisibleInterval } from '../../hooks/useVisibleInterval.js';
import { useAdoptClearingFailure } from './useAdoptClearingFailure.js';

// The in-place upgrade's own phase vocabulary (update/inplace.py), not the
// run/job/dim vocabulary.
const UPGRADE_PHASE = Object.freeze({
  IDLE: 'idle', UPGRADING: 'upgrading', INSTALLED: 'installed', ERROR: 'error',
});
// The API's refusal code while evaluations run (api/routes_update.py).
const EVALUATIONS_RUNNING = 'EVALUATIONS_RUNNING';
// pip finishes in seconds, brew in minutes; either way a second reads as live.
const STATUS_POLL_MS = 1000;

// The backend's in-place upgrade block, flattened for the banner and the row.
function readUpgrade(status) {
  const inPlace = status?.in_place_upgrade || {};
  return {
    supported: Boolean(inPlace.supported),
    blocked: (inPlace.evaluations_running ?? 0) > 0,
    installed: inPlace.phase === UPGRADE_PHASE.INSTALLED,
    error: inPlace.error || null,
    output: inPlace.output || '',
    version: inPlace.version || status?.latest || null,
  };
}

/**
 * Drives the pip-style install's upgrade: starts it, polls while it runs, and
 * restarts Quodeq once it is installed. `adoptStatus` takes each fresh status.
 * `blocked` is true while evaluations run, since an upgrade would swap the
 * code they still load.
 */
export function useInPlaceUpgrade(status, adoptStatus) {
  const { getUpdateStatus, startUpgrade, restartAfterUpgrade } = useApi();
  const [starting, setStarting] = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const phase = status?.in_place_upgrade?.phase || UPGRADE_PHASE.IDLE;
  const upgrading = phase === UPGRADE_PHASE.UPGRADING;

  const adopt = useAdoptClearingFailure('in_place_upgrade', adoptStatus, setStartFailed);

  useVisibleInterval(() => {
    getUpdateStatus().then(adopt).catch((e) => console.warn('upgrade status poll failed:', e));
  }, upgrading ? STATUS_POLL_MS : 0);

  const begin = useCallback(() => {
    setStarting(true);
    setStartFailed(false);
    startUpgrade()
      .then(() => getUpdateStatus().then(adopt))
      .catch((e) => {
        // An evaluation started since the status was read: re-read it so the
        // button shows why it waits, instead of reporting a failure.
        if (e?.code === EVALUATIONS_RUNNING) {
          getUpdateStatus().then(adopt).catch((err) => console.warn('upgrade status refresh failed:', err));
          return;
        }
        console.warn('upgrade start failed:', e);
        setStartFailed(true);
      })
      .finally(() => setStarting(false));
  }, [adopt, getUpdateStatus, startUpgrade]);

  // The API stops mid-request when the restart lands, so a failed request
  // here is the expected outcome, not an error to show.
  const restart = useCallback(() => {
    setRestarting(true);
    restartAfterUpgrade().catch((e) => console.info('restart request ended:', e));
  }, [restartAfterUpgrade]);

  return {
    ...readUpgrade(status),
    upgrading: upgrading || starting,
    failed: phase === UPGRADE_PHASE.ERROR || startFailed,
    restarting,
    begin,
    restart,
  };
}
