import { useCallback } from 'react';

/**
 * Wraps `adoptStatus` for an update flow whose start request can fail before
 * the backend records anything: a fresh status whose `field` block reports a
 * phase other than `errorPhase` clears the held failure via `setStartFailed(false)`.
 */
export function useAdoptClearingFailure({ field, errorPhase, adoptStatus, setStartFailed }) {
  return useCallback((next) => {
    if (next?.[field]?.phase !== errorPhase) setStartFailed(false);
    adoptStatus(next);
  }, [field, errorPhase, adoptStatus, setStartFailed]);
}
