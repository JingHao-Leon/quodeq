import { useMemo, useState } from 'react';
import { CodeOpenByDefault } from '../../../components/codeOpenContext.js';
import { FindingCard, CompliantRow } from './ScopeCards.jsx';
import { ScopeList } from './ScopeList.jsx';
import DeferredViolationList from '../../explorer/components/DeferredViolationList.jsx';
import { ROW_HEIGHT_PX, fileFindingKey } from '../../explorer/components/fileDetailWidgets.jsx';
import { severityLabel } from '../../../strings/labels.js';
import { SEVERITY_ORDER, SEVERITY_FILTER_ALL } from '../../../vocab/severity.js';
import { useFileDetailFiltering, dismissKey } from '../../explorer/components/useFileDetailFiltering.js';
import { useDashboardScrollElement } from '../../explorer/components/VirtualList.jsx';
import { useFindingsPaneSpecs, renderFileDetailRow } from '../../explorer/components/fileDetailRows.jsx';
import { ROW_KIND } from '../../explorer/components/findingListRows.js';
import { scopeFindings, SCOPE_KIND } from './scopeModel.js';
import FindingsHead from '../../../components/FindingsHead.jsx';
import SinceStrip from '../../../components/SinceStrip.jsx';
import { usePrincipleHead, severityDeltas } from './usePrincipleHead.jsx';
import ReqRail from './ReqRail.jsx';
import { requirementRail, requirementCounts, rowsOfRequirement, reqKindCounts } from './requirementRail.js';
import { scopeMetrics, filesChecked, areaRisk, tileChanges } from '../../../models/findingMetrics.js';
import { FINDING_TYPE } from '../../../vocab/findingType.js';
import { t } from '../../../strings/index.js';

/** How the scoped list reads: by severity (grouped, the default) or down the file by line. */
export const SCOPE_SORT = Object.freeze({ SEVERITY: 'severity', LINE: 'line' });
const SORTS = [SCOPE_SORT.SEVERITY, SCOPE_SORT.LINE];
/** How the scope shows its findings: a list beside the selected one (the default, first), or cards. */
export const SCOPE_VIEW = Object.freeze({ LIST: 'list', CARDS: 'cards' });
const VIEW_OPTIONS = () => [{ key: SCOPE_VIEW.LIST, label: t('violations.scopeViewList') }, { key: SCOPE_VIEW.CARDS, label: t('violations.scopeViewCards') }];
const isFindingRow = (item) => item.kind === FINDING_TYPE.VIOLATION || item.kind === ROW_KIND.LOW_CONF_ROW || item.kind === FINDING_TYPE.COMPLIANCE;
const findingOf = (item) => item.v || item.c || {};
/** Scopes checked on every file their dimension read: their per-100 base is the dimension's files read. */
const OVER_FILES_READ = new Set([SCOPE_KIND.DIMENSION, SCOPE_KIND.PRINCIPLE]);
/**
 * What the page already names, so rows leave it out (the file: rows show the
 * line only; the principle), what its per-100 base is, and whether it has a Risk.
 */
const withinOf = (scope) => ({ inFile: scope.kind === SCOPE_KIND.FILE, inPrinciple: scope.kind === SCOPE_KIND.PRINCIPLE, dimension: scope.dimension,
  overFilesRead: OVER_FILES_READ.has(scope.kind),
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

/** One row of the scope: the File page's group headers and toggle, then the scope's own cards. */
function renderScopeRow(item, { within, onDismiss, readOnly, setLowConfExpanded }) {
  return renderFileDetailRow(item, {
    onDismiss, readOnly, setLowConfExpanded, complianceTitle: t('violations.scopeCompliant'),
    renderViolation: (v, opts) => <FindingCard v={v} within={within} {...opts} />,
    renderCompliance: (c) => <CompliantRow c={c} within={within} />,
  });
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
 * What per 100 files is over: a dimension, and a principle of it, is checked
 * on every file the dimension read, so the dimension's files read (as the
 * dimension page counts); any other scope, or a dimension with no count, the
 * files its checks looked at.
 */
function filesBase(file, dims, within) {
  const read = within.overFilesRead ? (dims.find((d) => d.dimension === within.dimension)?.filesRead || 0) : 0;
  if (read) return { files: read, hint: t('violations.scopeStatFilesRead', { count: read }) };
  const checked = filesChecked(file);
  return { files: checked, hint: t('violations.scopeStatFilesHint', { count: checked }) };
}

/**
 * The Findings page scoped to a file, folder, dimension, principle,
 * requirement, the project or an area: its header and numbers, then every
 * finding of the scope, as a list beside the selected finding (the
 * default) or as cards with their code open; violations by severity and the
 * compliant checks after them, or all of them by line. Filters pick a
 * severity or the compliant checks (opening on `scope.filter`). Without
 * `onDismissFinding` (a past day, a shared project) nothing is dismissed;
 * `readOnly` (a past day) leaves out the fix plans too, which act on today.
 * A principle reads its requirements down the side, as a filter on its
 * findings, and its change since the previous period from `history` (the
 * project, its score history and grouping, the run on show), its tiles'
 * and severities' changes and its since line. A past run on show says so in
 * the header (`history.pastRun`: which, and the way back to today). A
 * principle's Risk tile opens the Map through `onOpenMap` (its nav params).
 */
export default function ScopedFindings({ scope, dims, projectName, dateLabel, onDismissFinding, readOnly = false, history = null, onOpenMap }) {
  const file = useMemo(() => scopeFindings(scope, dims, projectName), [scope, dims, projectName]);
  const head = usePrincipleHead(scope, dims, history, onOpenMap);
  const within = useMemo(() => withinOf(scope), [scope]);
  // A new scope starts the page over (filter, order, view); an area's key carries its paths, so it is built once per scope.
  const scopeKey = useMemo(() => JSON.stringify(scope), [scope]);
  if (!file) return <div className="wb-empty">{t('violations.scopeEmpty')}</div>;
  const sub = [t(`violations.scopeKind_${scope.kind}`), scope.kind === SCOPE_KIND.PRINCIPLE ? scope.dimension : null, dateLabel || head.when]
    .filter(Boolean).join(t('violations.wbDot'));
  return <ScopedFile key={scopeKey} file={file} within={within} dims={dims} sub={sub} head={head} initialFilter={scope.filter}
    onDismissFinding={onDismissFinding} readOnly={readOnly} period={{ pastRun: history?.pastRun || null, granularity: history?.granularity }} />;
}

/** The scope's controls: which findings to show, in what order, as a list or as cards. */
function ScopeBar({ sevCounts, compliance, filter, onFilter, sort, onSort, view, onView }) {
  return (
    <div className="findings-scope__bar">
      <Segments label={t('violations.scopeKindAria')} options={kindOptions(sevCounts, compliance)} value={filter} onPick={onFilter} />
      <SortChoice sort={sort} onSort={onSort} />
      <Segments label={t('violations.scopeViewAria')} value={view} options={VIEW_OPTIONS()} onPick={onView} />
    </div>
  );
}

/** The header's numbers: per 100 files over `base`, and a folder's or area's Risk over its live violations. */
function useScopeMetrics({ file, dims, within, filtering }) {
  const { dismissedSet, liveSevCounts, liveTotal, totalCompliance } = filtering;
  const base = useMemo(() => filesBase(file, dims, within), [file, dims, within]);
  const risk = useMemo(() => (within.showsRisk ? areaRisk(file, (v) => !dismissedSet.has(dismissKey(v)), within.judgedSmall) : null),
    [file, within, dismissedSet]);
  const metrics = scopeMetrics({ sevCounts: liveSevCounts, total: liveTotal, compliance: totalCompliance, files: base.files, risk });
  return { metrics, filesHint: base.hint };
}

/**
 * A principle's requirements (none for other scopes): the rail, the one
 * picked (`req`, null for all), and the kind filter's counts inside it.
 */
function useRequirementFilter({ file, within, filtering }) {
  const [req, setReq] = useState(null);
  const { dismissedSet, liveSevCounts, totalCompliance } = filtering;
  const isLive = useMemo(() => (v) => !dismissedSet.has(dismissKey(v)), [dismissedSet]);
  const rail = useMemo(() => (within.inPrinciple ? requirementRail(within.dimension, file, isLive) : null), [file, within, isLive]);
  const counts = useMemo(() => (within.inPrinciple ? requirementCounts(file) : null), [file, within]);
  const kindCounts = useMemo(() => (req ? reqKindCounts(file, req, isLive) : { sev: liveSevCounts, compliance: totalCompliance }),
    [req, file, isLive, liveSevCounts, totalCompliance]);
  return { req, setReq, rail, counts, kindCounts };
}

function ScopedFile({ file, within, dims, sub, head, initialFilter, onDismissFinding, readOnly, period }) {
  const [activeFilter, setActiveFilter] = useState(initialFilter || null);
  const [lowConfExpanded, setLowConfExpanded] = useState(false);
  const [sort, setSort] = useState(SCOPE_SORT.SEVERITY);
  const [view, setView] = useState(SCOPE_VIEW.LIST);
  // Each finding dismisses into its own dimension's run (the File page used one run for the whole page).
  const runOf = useMemo(() => new Map(dims.map((d) => [d.dimension, d.fromRunId])), [dims]);
  const onDismiss = onDismissFinding ? (v) => onDismissFinding(v, runOf.get(v.dimension)) : undefined;
  const filtering = useFileDetailFiltering({ file, onDismiss, activeFilter, lowConfExpanded });
  const { handleDismiss, items, violationsBySeverity } = filtering;
  useFindingsPaneSpecs(file, violationsBySeverity, activeFilter, readOnly);
  const scrollElement = useDashboardScrollElement();
  const { req, setReq, rail, counts, kindCounts } = useRequirementFilter({ file, within, filtering });
  const rows = useMemo(() => rowsOfRequirement(sortedRows(items, sort), req), [items, sort, req]);
  const { metrics, filesHint } = useScopeMetrics({ file, dims, within, filtering });
  const dismiss = onDismiss ? handleDismiss : undefined;
  return (
    <div className="findings-scope">
      <FindingsHead title={within.inPrinciple ? String(file.file).toLowerCase() : file.file} sub={sub} description={head.description} grade={head.grade}
        badge={head.badge} oneFile={within.inFile} showRisk={within.showsRisk} requirements={counts} riskAreas={head.riskAreas} metrics={metrics} filesHint={filesHint}
        changes={head.previous ? tileChanges(metrics, scopeMetrics({ ...head.previous, files: metrics.files })) : undefined}
        deltas={severityDeltas(metrics.sevCounts, head.previous)} pastRun={period.pastRun} />
      {head.since && <SinceStrip summary={head.since} granularity={period.granularity} />}
      <div className={rail ? 'findings-scope__work' : undefined}>
        {rail && <ReqRail rail={rail} total={filtering.liveTotal} selected={req} onSelect={setReq} />}
        <div className="findings-scope__main">
          <ScopeBar sevCounts={kindCounts.sev} compliance={kindCounts.compliance} filter={activeFilter} onFilter={setActiveFilter}
            sort={sort} onSort={setSort} view={view} onView={setView} />
          <CodeOpenByDefault.Provider value>
            {view === SCOPE_VIEW.LIST ? (
              <ScopeList rows={rows} within={within} onDismiss={dismiss} readOnly={readOnly} />
            ) : <DeferredViolationList
              resetKey={`${activeFilter ?? SEVERITY_FILTER_ALL}-${req ?? ''}-${sort}-${lowConfExpanded ? 'lc' : ''}-${file.file}`}
              items={rows} scrollElement={scrollElement} rowHeights={ROW_HEIGHT_PX} findingKey={fileFindingKey}
              renderItem={(item) => renderScopeRow(item, { within, onDismiss: dismiss, readOnly, setLowConfExpanded })}
            />}
          </CodeOpenByDefault.Provider>
        </div>
      </div>
    </div>
  );
}
