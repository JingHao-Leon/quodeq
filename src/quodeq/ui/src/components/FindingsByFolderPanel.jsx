/**
 * FindingsByFolderPanel: "where the findings live", one row per real folder,
 * most severe first. The prefix every finding shares is shown once in the
 * head instead of on every row. Each row reads like a file row: its last two
 * folders on top, the folders above them underneath, small and quiet, trimmed
 * from the left when long. The panel shows the top few, which fit beside the
 * Fix first panel beside it; every folder is one click away in the Map tab,
 * the tree of the whole codebase, and the map icon at a row's end opens that
 * folder there.
 */
import { useMemo } from 'react';

// Two-line rows: as many as the Fix first panel beside it shows.
export const FOLDERS_SHOWN = 8;
/** The place tables' columns, then the map icon when the panel can open the Map. */
const FOLDER_COLUMNS_WITH_MAP = `${PLACE_COLUMNS} 28px`;
import { GridTable, GridRow, GridCell, SectionLabel } from './terminal/index.js';
import { t, LOCALE } from '../strings/index.js';
import { groupByFolder, splitFolderLabel } from '../models/findingsGrouping.js';
import { SeverityAndFilesCells, PLACE_COLUMNS } from './SeverityBadges.jsx';
import { ROW_MAP_ICON } from './rowMapIcon.jsx';

/** The folder on top, bright; the folders above it below, small and quiet. */
function FolderPath({ label }) {
  const { lead, tail } = splitFolderLabel(label);
  return (
    <div className="offending-file-cell folder-path">
      <span className="offending-file-name">{tail || '/'}</span>
      {lead && <span className="folder-path__lead"><span className="folder-path__inner">{lead}</span></span>}
    </div>
  );
}

/** The row's end: the folder in the Map. Its click and Enter stay off the row, which opens the folder's findings. */
function FolderMapButton({ row, onClick }) {
  const path = row.dir || '/';
  const stop = (e) => e.stopPropagation();
  return (
    <GridCell align="right">
      <button type="button" className="risk-areas-panel__map" aria-label={t('overview.folderInMapAria', { path })}
        title={t('overview.folderInMap')} onKeyDown={stop}
        onClick={(e) => { stop(e); onClick(row); }}>
        {ROW_MAP_ICON}
      </button>
    </GridCell>
  );
}

export default function FindingsByFolderPanel({ dimensions, onFolderClick, onOpenMap, onFolderInMap }) {
  const { prefix, rows } = useMemo(() => groupByFolder(dimensions), [dimensions]);
  const fileCount = useMemo(() => rows.reduce((n, r) => n + r.fileCount, 0), [rows]);
  if (rows.length === 0) return null;
  return (
    <section className="qd-cards-panel folders-panel" aria-label={t('overview.foldersAria')}>
      <div className="qd-cards-panel__head">
        <SectionLabel>{t('overview.foldersLabel')}</SectionLabel>
        <span className="run-history-panel__stats">
          {prefix ? t('overview.foldersNoteIn', { prefix }) : t('overview.foldersNote')}
        </span>
      </div>
      <GridTable columns={onFolderInMap ? FOLDER_COLUMNS_WITH_MAP : PLACE_COLUMNS} dense>
        <GridRow header>
          <GridCell>{t('overview.folderCol')}</GridCell>
          <GridCell>{t('overview.sevCol')}</GridCell>
          <GridCell align="right">{t('overview.filesCol')}</GridCell>
          {onFolderInMap && <GridCell />}
        </GridRow>
        {rows.slice(0, FOLDERS_SHOWN).map((r) => (
          <GridRow key={r.dir} onClick={onFolderClick ? () => onFolderClick(r) : undefined}>
            <GridCell><div title={r.dir || '/'}><FolderPath label={r.label} /></div></GridCell>
            <SeverityAndFilesCells sev={r.sev} fileCount={r.fileCount} bare />
            {onFolderInMap && <FolderMapButton row={r} onClick={onFolderInMap} />}
          </GridRow>
        ))}
      </GridTable>
      <div className="panel-foot">
        <span>{t('overview.foldersFoot', { folders: rows.length.toLocaleString(LOCALE), files: fileCount.toLocaleString(LOCALE) })}</span>
        {onOpenMap && rows.length > FOLDERS_SHOWN && (
          <button type="button" className="panel-foot__link" onClick={onOpenMap}>{t('overview.foldersOpenMap')}</button>
        )}
      </div>
    </section>
  );
}
