import { t } from '../../../strings/index.js';

/** The divider's own width between the two columns, in px. */
const DIVIDER_PX = 8;

/** The draggable line between a list and its detail (useSplitWidth's `split`), a pointer control only. */
export default function SplitDivider({ split }) {
  return (
    <div className="findings-scope__divider" role="separator" aria-orientation="vertical" aria-label={t('violations.scopeResize')}
      onPointerDown={split.onPointerDown} />
  );
}

/** The split's columns: the list at its share, the divider, the detail filling the rest. */
export const splitColumns = (split) => ({ gridTemplateColumns: `${split.pct}% ${DIVIDER_PX}px minmax(0, 1fr)` });
