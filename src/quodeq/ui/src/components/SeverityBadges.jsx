/** The critical / major / minor badges of a count set, zeros left out. */
import { SevBadge, GridCell } from './terminal/index.js';
import { t, LOCALE } from '../strings/index.js';
import { SEVERITY_ORDER } from '../vocab/severity.js';

export default function SeverityBadges({ sev, className = 'offending-file-tags' }) {
  return (
    <span className={className}>
      {SEVERITY_ORDER.map((level) => (sev?.[level] ?? 0) > 0 && (
        <SevBadge key={level} level={level} count={sev[level]} format="count-abbr" />
      ))}
    </span>
  );
}

/**
 * The place tables' columns (areas, folders, files): name, severity, count.
 * Each GridTable row is its own grid, so only fixed tracks line a column up
 * from row to row; the severity track is a share of the row so it grows
 * with the panel.
 */
export const PLACE_COLUMNS = 'minmax(0, 1fr) 35% 64px';

/**
 * A grouped row's closing cells: its severity badges, then its file count;
 * bare under a FILES column header, "12f" where no header names the column.
 */
export function SeverityAndFilesCells({ sev, fileCount, bare = false }) {
  return (
    <>
      <GridCell><SeverityBadges sev={sev} /></GridCell>
      <GridCell numeric>{bare ? fileCount.toLocaleString(LOCALE) : t('overview.fileCountAbbrev', { count: fileCount })}</GridCell>
    </>
  );
}
