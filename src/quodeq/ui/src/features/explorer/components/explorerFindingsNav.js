import { NAV_TAB } from '../../../vocab/navTab.js';
import { SEVERITY_FILTER_ALL } from '../../../vocab/severity.js';
import { SCOPE_KIND, openScope, cardFilter } from '../../violations/scope/scopeModel.js';
import { runAsOf } from '../../violations/asOf.js';

/**
 * The run the explorer shows, as its scoped views' `asOf`. The rule: it is
 * today when it shows the dimension's latest run (`latestRunId`, from
 * today's payload) or no run at all (the explorer then reads the latest);
 * any other run (a history bar, a past run opened from the Overview or a
 * run page) is that run, read-only, and so is any run while today's latest
 * is not known.
 * @param {string|null} activeRunId
 * @param {string|null} latestRunId
 * @param {{runId: string, dateISO?: string}[]} [trend] the history, for the run's day
 * @returns {{runId: string, day: (string|null)}|null}
 */
export function explorerAsOf(activeRunId, latestRunId, trend) {
  if (!activeRunId || activeRunId === latestRunId) return null;
  return runAsOf(activeRunId, (trend || []).find((p) => p.runId === activeRunId)?.dateISO);
}

function scopedNav({ dimension, scoped, onNavigate, activeRunId, trend }) {
  const asOf = explorerAsOf(activeRunId, scoped.latestRunId, trend);
  return {
    toCard: (kind) => openScope(onNavigate, { kind: SCOPE_KIND.DIMENSION, dimension, filter: cardFilter(kind) }, asOf),
    toFile: (f) => openScope(onNavigate, { kind: SCOPE_KIND.FILE, path: f.file }, asOf),
    toPrinciple: (name) => openScope(onNavigate, { kind: SCOPE_KIND.PRINCIPLE, dimension, principle: name }, asOf),
  };
}

function filePageNav({ dimFile, onNavigate, project, activeRunId, activeDateLabel, sourceTab, buildEvalPrincipal }) {
  const at = { runId: activeRunId, dateLabel: activeDateLabel, sourceTab, fromProject: project };
  return {
    toCard: (kind) => onNavigate?.(NAV_TAB.FILE, { file: dimFile, severityFilter: cardFilter(kind) || SEVERITY_FILTER_ALL, ...at }),
    toFile: (f) => onNavigate?.(NAV_TAB.FILE, { file: f, ...at }),
    toPrinciple: (name) => onNavigate?.(NAV_TAB.EVAL_PRINCIPLE, { evalPrincipal: buildEvalPrincipal?.(name), sourceTab }),
  };
}

/**
 * Where the explorer's finding entries go. With `scoped` (`{latestRunId}`,
 * the explorer shows the selected project) they open scoped Findings views:
 * the header's tiles and severity badges the dimension on their filter, a
 * row of the files table the file, a principle (card or radial) the
 * principle. A cross-project explorer (Compare) keeps the File page with
 * the snapshot it is handed, and the principle page, as the Violations tab
 * only reads the selected project.
 * @param {{dimension: string, scoped: ({latestRunId: (string|null)}|null), dimFile: object, onNavigate?: Function,
 *   project: string, activeRunId: (string|null), activeDateLabel: (string|null), sourceTab?: string, trend?: object[],
 *   buildEvalPrincipal?: (name: string) => object}} args
 * @returns {{handleCardNavigate: Function, onSeverityBadge: Function, onFileClick: Function, onPrincipleClick: Function}}
 */
export function buildExplorerFindingsNav(args) {
  const { toCard, toFile, toPrinciple } = args.scoped ? scopedNav(args) : filePageNav(args);
  return { handleCardNavigate: toCard, onSeverityBadge: (level) => () => toCard(level), onFileClick: toFile, onPrincipleClick: toPrinciple };
}
