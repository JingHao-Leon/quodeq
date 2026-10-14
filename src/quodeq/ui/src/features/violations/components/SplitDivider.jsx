import { t } from '../../../strings/index.js';
import { MIN_PCT, MAX_PCT } from '../hooks/useSplitWidth.js';

/** The divider's own width between the two columns, in px. */
const DIVIDER_PX = 8;

/**
 * The line between a list and its detail (useSplitWidth's `split`): dragged
 * with the pointer, or focused and moved with the arrow keys, its value the
 * list's share of the row.
 */
export default function SplitDivider({ split }) {
  return (
    <div className="findings-scope__divider" role="slider" tabIndex={0} aria-orientation="horizontal" aria-label={t('violations.scopeResize')}
      aria-valuenow={Math.round(split.pct)} aria-valuemin={MIN_PCT} aria-valuemax={MAX_PCT} aria-valuetext={`${Math.round(split.pct)}%`}
      onPointerDown={split.onPointerDown} onKeyDown={split.onKeyDown} />
  );
}

/** The split's columns: the list at its share, the divider, the detail filling the rest. */
export const splitColumns = (split) => ({ gridTemplateColumns: `${split.pct}% ${DIVIDER_PX}px minmax(0, 1fr)` });
