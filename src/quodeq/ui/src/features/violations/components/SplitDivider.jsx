import { t } from '../../../strings/index.js';

/** The draggable line between a list and its detail (useSplitWidth's `split`). */
export default function SplitDivider({ split }) {
  return (
    <div className="findings-scope__divider" role="separator" aria-orientation="vertical" aria-label={t('violations.scopeResize')}
      aria-valuenow={Math.round(split.pct)} onPointerDown={split.onPointerDown} />
  );
}

/** The split's columns: the list at its share, the divider, the detail filling the rest. */
export const splitColumns = (split) => ({ gridTemplateColumns: `${split.pct}% 8px minmax(0, 1fr)` });
