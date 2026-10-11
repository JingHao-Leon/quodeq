import { useCallback, useState } from 'react';
import { usePrefetchRun } from '../../dashboard/hooks/usePrefetchRun.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';
import ChangeStrip from './ChangeStrip.jsx';
import RunList from './RunList.jsx';

/** The hovered run, lit in list and strip, its run page warmed after a dwell. */
function useRunHover(project, shared) {
  const [hoverId, setHoverId] = useState(null);
  const { prefetchRun, cancelPrefetch } = usePrefetchRun(project, shared ? PROJECT_SOURCE.SHARED : PROJECT_SOURCE.LOCAL);
  const onHover = useCallback((id) => {
    setHoverId(id);
    if (id) prefetchRun(id);
    else cancelPrefetch();
  }, [prefetchRun, cancelPrefetch]);
  return { hoverId, onHover };
}

/**
 * Strip, list and the selected run. Hover state lives here, not in the page:
 * `detail` is an element the page built, so a hover re-renders the list and
 * the strip while React reuses the run panel as it is.
 */
export default function RunLogBody({
  project, shared, rows, runsById, selectedId, onPick, onPickFromList, stripStart, onPage, onClearFilters, detail,
}) {
  const { hoverId, onHover } = useRunHover(project, shared);
  return (
    <>
      {rows.length > 0 && (
        <ChangeStrip rows={rows} selectedId={selectedId} onSelect={onPick} hoverId={hoverId}
          onHover={onHover} start={stripStart} onPage={onPage} />
      )}
      <div className="rl-split">
        <RunList rows={rows} runsById={runsById} selectedId={selectedId} onSelect={onPickFromList}
          hoverId={hoverId} onHover={onHover} onClearFilters={onClearFilters} />
        {detail}
      </div>
    </>
  );
}
