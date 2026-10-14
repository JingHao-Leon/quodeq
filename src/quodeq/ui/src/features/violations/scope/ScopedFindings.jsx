import { useMemo, useState } from 'react';
import SeverityFilterPills from '../../../components/SeverityFilterPills.jsx';
import { CodeOpenByDefault } from '../../../components/codeOpenContext.js';
import FileDetailHeader from '../../explorer/components/FileDetailHeader.jsx';
import { useFileDetailFiltering } from '../../explorer/components/useFileDetailFiltering.js';
import { useDashboardScrollElement } from '../../explorer/components/VirtualList.jsx';
import { FindingRowsList, useFindingsPaneSpecs } from '../../explorer/components/fileDetailRows.jsx';
import { ROW_KIND } from '../../explorer/components/findingListRows.js';
import { scopeFindings } from './scopeModel.js';
import { FINDING_TYPE } from '../../../vocab/findingType.js';
import { t } from '../../../strings/index.js';

/** How the scoped list reads: by severity (grouped, the default) or down the file by line. */
export const SCOPE_SORT = Object.freeze({ SEVERITY: 'severity', LINE: 'line' });
const SORTS = [SCOPE_SORT.SEVERITY, SCOPE_SORT.LINE];
const isFindingRow = (item) => item.kind === FINDING_TYPE.VIOLATION || item.kind === ROW_KIND.LOW_CONF_ROW || item.kind === FINDING_TYPE.COMPLIANCE;
const findingOf = (item) => item.v || item.c || {};
/** Down each file by line, the files in path order (one file: just by line). */
const byFileThenLine = (a, b) => {
  const x = findingOf(a);
  const y = findingOf(b);
  return (x.file || '').localeCompare(y.file || '') || (x.line ?? 0) - (y.line ?? 0);
};

/** The rows in reading order: grouped by severity as built, or every finding down the file. */
function sortedRows(items, sort) {
  if (sort !== SCOPE_SORT.LINE) return items;
  return items.filter(isFindingRow).sort(byFileThenLine);
}

function SortChoice({ sort, onSort }) {
  return (
    <div className="term-seg findings-scope__sort" role="group" aria-label={t('violations.scopeSortAria')}>
      {SORTS.map((s) => (
        <button key={s} type="button" className={`term-btn${s === sort ? ' term-btn--on' : ''}`} aria-pressed={s === sort} onClick={() => onSort(s)}>
          {t(`violations.scopeSort_${s}`)}
        </button>
      ))}
    </div>
  );
}

/**
 * The Findings page scoped to a file, folder, dimension, requirement, the
 * project or an area: its header and numbers, then every finding of the
 * scope as a card with its code open, violations by severity and the
 * compliant checks after them, or all of them by line. Filters pick a
 * severity or the compliant checks (opening on `scope.filter`); `onList`
 * hands over to the workbench list on the same filters. Without
 * `onDismissFinding` (a past day, a shared project) nothing is dismissed;
 * `readOnly` (a past day) leaves out the fix plans too, which act on today.
 */
export default function ScopedFindings({ scope, dims, projectName, dateLabel, onDismissFinding, onList, readOnly = false }) {
  const file = useMemo(() => scopeFindings(scope, dims, projectName), [scope, dims, projectName]);
  if (!file) return <div className="wb-empty">{t('violations.scopeEmpty')}</div>;
  const sub = [t(`violations.scopeKind_${scope.kind}`), dateLabel].filter(Boolean).join(t('violations.wbDot'));
  return <ScopedFile key={JSON.stringify(scope)} file={file} dims={dims} sub={sub} initialFilter={scope.filter}
    onDismissFinding={onDismissFinding} onList={onList} readOnly={readOnly} />;
}

function ScopedFile({ file, dims, sub, initialFilter, onDismissFinding, onList, readOnly }) {
  const [activeFilter, setActiveFilter] = useState(initialFilter || null);
  const [lowConfExpanded, setLowConfExpanded] = useState(false);
  const [sort, setSort] = useState(SCOPE_SORT.SEVERITY);
  // Each finding dismisses into its own dimension's run (the File page used one run for the whole page).
  const runOf = useMemo(() => new Map(dims.map((d) => [d.dimension, d.fromRunId])), [dims]);
  const onDismiss = onDismissFinding ? (v) => onDismissFinding(v, runOf.get(v.dimension)) : undefined;
  const { handleDismiss, liveSevCounts, liveTotal, totalCompliance, items, violationsBySeverity } = useFileDetailFiltering({
    file, onDismiss, activeFilter, lowConfExpanded,
  });
  useFindingsPaneSpecs(file, violationsBySeverity, activeFilter, readOnly);
  const scrollElement = useDashboardScrollElement();
  const rows = useMemo(() => sortedRows(items, sort), [items, sort]);
  return (
    <div className="findings-scope">
      <FileDetailHeader file={file} sevCounts={liveSevCounts} totalViolations={liveTotal} totalCompliance={totalCompliance}
        dimensionsCount={file.dimensionsCount || 0} dateLabel={sub} />
      <div className="findings-scope__bar">
        <SeverityFilterPills counts={liveSevCounts} complianceCount={totalCompliance} activeFilter={activeFilter} onFilterChange={setActiveFilter} />
        <SortChoice sort={sort} onSort={setSort} />
        {onList && <button type="button" className="wb-link findings-scope__list" onClick={onList}>{t('violations.scopeAsList')}</button>}
      </div>
      <CodeOpenByDefault.Provider value>
        <FindingRowsList
          rows={rows} resetKey={`${activeFilter ?? 'all'}-${sort}-${lowConfExpanded ? 'lc' : ''}-${file.file}`}
          scrollElement={scrollElement} setLowConfExpanded={setLowConfExpanded} readOnly={readOnly}
          onDismiss={onDismiss ? handleDismiss : undefined} complianceTitle={t('violations.scopeCompliant')}
        />
      </CodeOpenByDefault.Provider>
    </div>
  );
}
