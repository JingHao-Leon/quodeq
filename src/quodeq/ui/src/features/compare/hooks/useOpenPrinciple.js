import { useCallback } from 'react';

/**
 * Open one project's own view of one principle: the target (a matrix cell,
 * a principle health row, an attention item) names the project, the
 * dimension and the principle, and `onOpenProjectPrinciple` opens that
 * project's findings on it.
 */
export function useOpenPrinciple({ onOpenProjectPrinciple, openProject }) {
  return useCallback((target) => {
    // Remote rows can't deep-link into local project pages; opening the
    // shared project itself is the honest fallback (same degradation the
    // standings rows use).
    if (target?.remote) { openProject(target.id); return; }
    if (!onOpenProjectPrinciple || !target?.dimName || !target?.principle) return;
    onOpenProjectPrinciple({ id: target.id, dimName: target.dimName, principle: target.principle });
  }, [onOpenProjectPrinciple, openProject]);
}
