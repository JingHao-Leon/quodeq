// Props: { files, onFileClick }
// Terminal-styled tabular list of top offending files by violation count.
// Reads like the folder and area tables: name, severity badges, then the count.
// onFileClick is called with the file object when a row is clicked.

import { memo } from 'react';
import { GridTable, GridRow, GridCell, SevBadge, SectionLabel } from './terminal/index.js';
import { t } from '../strings/index.js';
import { PLACE_COLUMNS } from './SeverityBadges.jsx';

/** Basename and directory from a single lastIndexOf, computed once per row. */
function splitPath(filepath) {
  if (!filepath) return { name: '', dir: '' };
  const idx = filepath.lastIndexOf('/');
  return idx >= 0
    ? { name: filepath.slice(idx + 1), dir: filepath.slice(0, idx) }
    : { name: filepath, dir: '' };
}

/** The files panel's head: its label and count, and how the files are sorted. */
export function OffendingFilesHead({ count }) {
  return (
    <div className="qd-cards-panel__head">
      <SectionLabel>{t('overview.violationsByFileLabel')} · {count}</SectionLabel>
      <span className="run-history-panel__stats">{t('overview.sortedBySeverity')}</span>
    </div>
  );
}

export default memo(function TopOffendingFilesTable({ files, onFileClick }) {
  const list = files || [];
  if (list.length === 0) return null;

  return (
    <GridTable columns={PLACE_COLUMNS} dense>
      <GridRow header>
        <GridCell>{t('overview.fileCol')}</GridCell>
        <GridCell>{t('overview.sevCol')}</GridCell>
        <GridCell align="right">{t('overview.countCol')}</GridCell>
      </GridRow>

      {list.map((f, idx) => {
        const { name, dir } = splitPath(f.file);
        return (
          <GridRow
            key={idx}
            onClick={onFileClick ? () => onFileClick(f) : undefined}
          >
            <GridCell>
              <div className="offending-file-cell">
                <span className="offending-file-name">{name}</span>
                {dir && <span className="offending-file-path">{dir}</span>}
              </div>
            </GridCell>
            <GridCell>
              <span className="offending-file-tags">
                {f.critical > 0 && <SevBadge level="critical" count={f.critical} format="count-abbr" />}
                {f.major    > 0 && <SevBadge level="major"    count={f.major}    format="count-abbr" />}
                {f.minor    > 0 && <SevBadge level="minor"    count={f.minor}    format="count-abbr" />}
              </span>
            </GridCell>
            <GridCell numeric>{f.total}</GridCell>
          </GridRow>
        );
      })}
    </GridTable>
  );
});
