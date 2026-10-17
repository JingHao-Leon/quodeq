import { syncCell } from '../../../models/standardSync.js';
import { relativeTime } from '../../../utils/relativeTime.js';
import { t } from '../../../strings/index.js';

const EMPTY = '–';
const TONE_MUTED = 'muted';

export default function StandardSyncCell({ standard }) {
  const cell = syncCell(standard);
  if (!cell) return <div className="standards-cell standards-cell--sync" />;
  const label = cell.key ? t(cell.key, { time: relativeTime(cell.time) }) : EMPTY;
  return (
    <div className={`standards-cell standards-cell--sync standards-sync standards-sync--${cell.tone}`}>
      {cell.tone !== TONE_MUTED && <span className="standards-sync__dot" aria-hidden="true" />}
      <span>{label}</span>
    </div>
  );
}
