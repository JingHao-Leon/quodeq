import { useMemo, useState } from 'react';
import { CodeOpenByDefault } from '../../../components/codeOpenContext.js';
import { FindingCard, CompliantRow, ScopeList } from './ScopeCards.jsx';
import DeferredViolationList from '../../explorer/components/DeferredViolationList.jsx';
import { GroupHeader, LowConfidenceToggle, ROW_HEIGHT_PX, fileFindingKey } from '../../explorer/components/fileDetailWidgets.jsx';
import { severityLabel } from '../../../strings/labels.js';
import { SEVERITY_ORDER } from '../../../vocab/severity.js';
import { useFileDetailFiltering } from '../../explorer/components/useFileDetailFiltering.js';
import { useDashboardScrollElement } from '../../explorer/components/VirtualList.jsx';
import { useFindingsPaneSpecs } from '../../explorer/components/fileDetailRows.jsx';
import { ROW_KIND } from '../../explorer/components/findingListRows.js';
import { scopeFindings, principleGradeOf, SCOPE_KIND } from './scopeModel.js';
import FindingsHead from './FindingsHead.jsx';
import { scopeMetrics, filesChecked, areaRisk } from './scopeMetrics.js';
import { useStandardDescriptions } from '../../explorer/hooks/useStandardDescriptions.js';
import { GRADE } from '../../../vocab/grade.js';
import { EVIDENCE_CONFIDENCE } from '../../../vocab/evidenceConfidence.js';
import { FINDING_TYPE } from '../../../vocab/findingType.js';
import { t } from '../../../strings/index.js';

/** How the scoped list reads: by severity (grouped, the default) or down the file by line. */
export const SCOPE_SORT = Object.freeze({ SEVERITY: 'severity', LINE: 'line' });
const SORTS = [SCOPE_SORT.SEVERITY, SCOPE_SORT.LINE];
const isFindingRow = (item) => item.kind === FINDING_TYPE.VIOLATION || item.kind === ROW_KIND.LOW_CONF_ROW || item.kind === FINDING_TYPE.COMPLIANCE;
const findingOf = (item) => item.v || item.c || {};
/** What the page already names, so rows leave it out: the file (rows show the line only), the principle. */
const withinOf = (scope) => ({ inFile: scope.kind === SCOPE_KIND.FILE, inPrinciple: scope.kind === SCOPE_KIND.PRINCIPLE, dimension: scope.dimension,
  showsRisk: scope.kind === SCOPE_KIND.FOLDER || scope.kind === SCOPE_KIND.AREA, judgedSmall: Boolean(scope.small) });
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

const capitalized = (word) => word.charAt(0).toUpperCase() + word.slice(1);

/** One row of the scope: a group header, the low-confidence toggle, a violation card or a compliant check. */
function renderScopeRow(item, { within, onDismiss, readOnly, setLowConfExpanded }) {
  switch (item.kind) {
    case ROW_KIND.SEV_HEADER: return <GroupHeader title={capitalized(severityLabel(item.sev))} count={item.count} />;
    case ROW_KIND.COMPLIANCE_HEADER: return <GroupHeader title={t('violations.scopeCompliant')} count={item.count} />;
    case ROW_KIND.LOW_CONF_TOGGLE: return <LowConfidenceToggle count={item.count} expanded={item.expanded} onToggle={() => setLowConfExpanded((v) => !v)} />;
    case FINDING_TYPE.VIOLATION:
    case ROW_KIND.LOW_CONF_ROW: return <FindingCard v={item.v} within={within} onDismiss={onDismiss} readOnly={readOnly} />;
    case FINDING_TYPE.COMPLIANCE: return <CompliantRow c={item.c} within={within} />;
    default: return null;
  }
}

/** One segmented group of choices, with an optional count per choice. */
function Segments({ label, options, value, onPick }) {
  return (
    <div className="term-seg findings-scope__seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" className={`term-btn${o.key === value ? ' term-btn--on' : ''}`} aria-pressed={o.key === value} onClick={() => onPick(o.key)}>
          {o.label}{o.count != null && <span className="findings-scope__count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** The kinds to show: all, each severity present, the compliant checks. */
function kindOptions(sevCounts, compliance) {
  const out = [{ key: null, label: t('violations.scopeKindAll') }];
  for (const sev of SEVERITY_ORDER) if (sevCounts[sev]) out.push({ key: sev, label: severityLabel(sev), count: sevCounts[sev] });
  if (compliance) out.push({ key: FINDING_TYPE.COMPLIANCE, label: t('violations.scopeCompliantShort'), count: compliance });
  return out;
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
/**
 * What per 100 files is over: a principle is checked on every file its
 * dimension read, so the dimension's files read; any other scope the files
 * its checks looked at.
 */
function filesBase(file, dims, within) {
  const read = within.inPrinciple ? (dims.find((d) => d.dimension === within.dimension)?.filesRead || 0) : 0;
  if (read) return { files: read, hint: t('violations.scopeStatFilesRead', { count: read }) };
  const checked = filesChecked(file);
  return { files: checked, hint: t('violations.scopeStatFilesHint', { count: checked }) };
}

/** A principle's grade for its header ring: its score, whether the evidence grades it at all, and what the evidence says. */
function gradeOf(row) {
  if (!row) return null;
  const insufficient = row.grade === GRADE.INSUFFICIENT;
  const hint = insufficient ? t('explorer.notEnoughEvidence')
    : row.confidence === EVIDENCE_CONFIDENCE.LOW ? t('explorer.thinEvidenceHint') : null;
  return { score: row.score, insufficient, hint };
}

/** What a principle scope adds to its header: the standard's description of it, and its score. */
function usePrincipleHead(scope, dims) {
  const { principleDescriptions } = useStandardDescriptions(scope.kind === SCOPE_KIND.PRINCIPLE ? scope.dimension : null);
  if (scope.kind !== SCOPE_KIND.PRINCIPLE) return {};
  return { description: principleDescriptions?.[scope.principle] || '', grade: gradeOf(principleGradeOf(scope, dims)) };
}

export default function ScopedFindings({ scope, dims, projectName, dateLabel, onDismissFinding, onList, readOnly = false }) {
  const file = useMemo(() => scopeFindings(scope, dims, projectName), [scope, dims, projectName]);
  const head = usePrincipleHead(scope, dims);
  const within = useMemo(() => withinOf(scope), [scope]);
  if (!file) return <div className="wb-empty">{t('violations.scopeEmpty')}</div>;
  const sub = [t(`violations.scopeKind_${scope.kind}`), scope.kind === SCOPE_KIND.PRINCIPLE ? scope.dimension : null, dateLabel]
    .filter(Boolean).join(t('violations.wbDot'));
  return <ScopedFile key={JSON.stringify(scope)} file={file} within={within} dims={dims} sub={sub} head={head} initialFilter={scope.filter}
    onDismissFinding={onDismissFinding} onList={onList} readOnly={readOnly} />;
}

function ScopedFile({ file, within, dims, sub, head, initialFilter, onDismissFinding, onList, readOnly }) {
  const [activeFilter, setActiveFilter] = useState(initialFilter || null);
  const [lowConfExpanded, setLowConfExpanded] = useState(false);
  const [sort, setSort] = useState(SCOPE_SORT.SEVERITY);
  const [view, setView] = useState('list');
  // Each finding dismisses into its own dimension's run (the File page used one run for the whole page).
  const runOf = useMemo(() => new Map(dims.map((d) => [d.dimension, d.fromRunId])), [dims]);
  const onDismiss = onDismissFinding ? (v) => onDismissFinding(v, runOf.get(v.dimension)) : undefined;
  const { dismissedSet, handleDismiss, liveSevCounts, liveTotal, totalCompliance, items, violationsBySeverity } = useFileDetailFiltering({
    file, onDismiss, activeFilter, lowConfExpanded,
  });
  useFindingsPaneSpecs(file, violationsBySeverity, activeFilter, readOnly);
  const scrollElement = useDashboardScrollElement();
  const rows = useMemo(() => sortedRows(items, sort), [items, sort]);
  const base = useMemo(() => filesBase(file, dims, within), [file, dims, within]);
  const risk = useMemo(() => (within.showsRisk ? areaRisk(file, (v) => !dismissedSet.has(`${v.file}:${v.line}`), within.judgedSmall) : null),
    [file, within, dismissedSet]);
  return (
    <div className="findings-scope">
      <FindingsHead title={file.file} sub={sub} description={head.description} grade={head.grade} oneFile={within.inFile} showRisk={within.showsRisk}
        metrics={scopeMetrics({ sevCounts: liveSevCounts, total: liveTotal, compliance: totalCompliance, files: base.files, risk })} filesHint={base.hint} />
      <div className="findings-scope__bar">
        <Segments label={t('violations.scopeKindAria')} options={kindOptions(liveSevCounts, totalCompliance)} value={activeFilter} onPick={setActiveFilter} />
        <SortChoice sort={sort} onSort={setSort} />
        <Segments label={t('violations.scopeViewAria')} value={view}
          options={[{ key: 'list', label: t('violations.scopeViewList') }, { key: 'cards', label: t('violations.scopeViewCards') }]}
          onPick={setView} />
      </div>
      <CodeOpenByDefault.Provider value>
        {view === 'list' ? (
          <ScopeList rows={rows} within={within} onDismiss={onDismiss ? handleDismiss : undefined} readOnly={readOnly} />
        ) : <DeferredViolationList
          resetKey={`${activeFilter ?? 'all'}-${sort}-${lowConfExpanded ? 'lc' : ''}-${file.file}`}
          items={rows} scrollElement={scrollElement} rowHeights={ROW_HEIGHT_PX} findingKey={fileFindingKey}
          renderItem={(item) => renderScopeRow(item, { within, onDismiss: onDismiss ? handleDismiss : undefined, readOnly, setLowConfExpanded })}
        />}
      </CodeOpenByDefault.Provider>
    </div>
  );
}
