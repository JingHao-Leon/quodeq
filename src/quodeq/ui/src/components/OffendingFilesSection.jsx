import { useState } from 'react';
import TopOffendingFilesTable, { OffendingFilesHead } from './TopOffendingFilesTable.jsx';
import ListShowMore from './ListShowMore.jsx';
import { t, LOCALE } from '../strings/index.js';
import { withPending } from '../utils/pendingClass.js';

// The files table opens on the most severe few; the rest are one click away.
export const FILES_SHOWN = 8;

/**
 * Violations by file: the worst few, worst first, and "show all N files"
 * for the rest. Shared by the Overview and the dimension page.
 * @param {{topFiles: object[], onFileClick?: (file: object) => void, pending?: boolean}} props
 */
export default function OffendingFilesSection({ topFiles, onFileClick, pending = false }) {
  const [open, setOpen] = useState(false);
  if (topFiles.length === 0) return null;
  return (
    <section className={withPending('qd-cards-panel offending-panel', pending)} aria-label={t('overview.violationsByFileAria')} aria-busy={pending || undefined}>
      <OffendingFilesHead count={topFiles.length} />
      <TopOffendingFilesTable files={open ? topFiles : topFiles.slice(0, FILES_SHOWN)} onFileClick={onFileClick} />
      <ListShowMore
        open={open} total={topFiles.length} shown={FILES_SHOWN}
        allLabel={t('overview.showAllFiles', { count: topFiles.length.toLocaleString(LOCALE) })}
        onToggle={() => setOpen(!open)}
      />
    </section>
  );
}
