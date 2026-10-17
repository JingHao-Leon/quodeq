import { useCallback } from 'react';

/**
 * Wraps `adoptStatus` for an update flow whose start request can fail before
 * the backend records anything: a fresh status whose `field` block reports a
 * phase other than "error" clears the held failure via `setStartFailed(false)`.
 */
export function useAdoptClearingFailure(field, adoptStatus, setStartFailed) {
  return useCallback((next) => {
    if ((next?.[field]?.phase || 'idle') !== 'error') setStartFailed(false);
    adoptStatus(next);
  }, [field, adoptStatus, setStartFailed]);
}
