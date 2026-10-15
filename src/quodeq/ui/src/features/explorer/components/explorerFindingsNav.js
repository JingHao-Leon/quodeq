import { NAV_TAB } from '../../../vocab/navTab.js';
import { SEVERITY_FILTER_ALL } from '../../../vocab/severity.js';
import { SCOPE_KIND, openScope, cardFilter } from '../../violations/scope/scopeModel.js';
import { runAsOf } from '../../violations/asOf.js';
import { riskMapParams, packMapParams } from '../../map/model/riskLinks.js';

// A path chip ending in '/' is a folder: everything under it.
const FOLDER_SUFFIX = '/';

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
    toRequirement: onNavigate && ((row) => openScope(onNavigate, { kind: SCOPE_KIND.REQUIREMENT, dimension: row.dimension, req: row.req, text: row.text }, asOf)),
    // A folder opens the findings list on that folder and this dimension.
    toFolder: onNavigate && ((row) => onNavigate(NAV_TAB.VIOLATIONS, { wb: { paths: [`${row.dir}${FOLDER_SUFFIX}`], dimension, selectedId: null }, asOf })),
    // An area opens on its findings over this dimension (the panel builds the scope); the Map measures
    // today's findings, so it opens today's view even on a past run.
    toAreaFindings: onNavigate && ((scope) => openScope(onNavigate, scope)),
    // The Map's Risk tab filtered to this dimension: with an area selected, or the whole sky.
    toAreaInMap: onNavigate && ((area) => onNavigate(NAV_TAB.MAP, riskMapParams({ dimensions: [dimension], area: area.name }))),
    toRisk: onNavigate && (() => onNavigate(NAV_TAB.MAP, riskMapParams({ dimensions: [dimension] }))),
    toFolderInMap: onNavigate && ((row) => onNavigate(NAV_TAB.MAP, packMapParams(row.dir))),
  };
}

function filePageNav({ dimFile, onNavigate, project, activeRunId, activeDateLabel, sourceTab, buildEvalPrincipal }) {
  const at = { runId: activeRunId, dateLabel: activeDateLabel, sourceTab, fromProject: project };
  return {
    toCard: (kind) => onNavigate?.(NAV_TAB.FILE, { file: dimFile, severityFilter: cardFilter(kind) || SEVERITY_FILTER_ALL, ...at }),
    toFile: (f) => onNavigate?.(NAV_TAB.FILE, { file: f, ...at }),
    toPrinciple: (name) => onNavigate?.(NAV_TAB.EVAL_PRINCIPLE, { evalPrincipal: buildEvalPrincipal?.(name), sourceTab }),
    // The Violations tab and the Map read the selected project only: another project's requirements, folders and areas open nothing.
    toRequirement: undefined,
    toFolder: undefined,
    toAreaFindings: undefined,
    toAreaInMap: undefined,
    toRisk: undefined,
    toFolderInMap: undefined,
  };
}

/**
 * Where the explorer's finding entries go. With `scoped` (`{latestRunId}`,
 * the explorer shows the selected project) they open scoped Findings views:
 * the header's tiles and severity badges the dimension on their filter, a
 * row of the files table the file, a principle (card or radial) the
 * principle, a Fix first row its requirement, a folder the findings list on
 * that folder and the dimension, an area its findings over the dimension
 * (its map icon the Map's Risk tab filtered to the dimension with that area
 * selected, the panel's foot the whole filtered sky). A cross-project explorer (Compare) keeps the File page with the
 * snapshot it is handed, and the principle page, and its requirements,
 * folders and areas open nothing, as the Violations tab and the Map only
 * read the selected project.
 * @param {{dimension: string, scoped: ({latestRunId: (string|null)}|null), dimFile: object, onNavigate?: Function,
 *   project: string, activeRunId: (string|null), activeDateLabel: (string|null), sourceTab?: string, trend?: object[],
 *   buildEvalPrincipal?: (name: string) => object}} args
 * @returns {{handleCardNavigate: Function, onSeverityBadge: Function, onFileClick: Function, onPrincipleClick: Function,
 *   onRequirementClick: (Function|undefined), onFolderClick: (Function|undefined), onAreaFindings: (Function|undefined),
 *   onAreaInMap: (Function|undefined), onOpenRisk: (Function|undefined), onFolderInMap: (Function|undefined)}}
 */
export function buildExplorerFindingsNav(args) {
  const { toCard, toFile, toPrinciple, toRequirement, toFolder, toAreaFindings, toAreaInMap, toRisk, toFolderInMap } = args.scoped ? scopedNav(args) : filePageNav(args);
  return {
    handleCardNavigate: toCard, onSeverityBadge: (level) => () => toCard(level), onFileClick: toFile, onPrincipleClick: toPrinciple,
    onRequirementClick: toRequirement, onFolderClick: toFolder, onAreaFindings: toAreaFindings, onAreaInMap: toAreaInMap,
    onOpenRisk: toRisk, onFolderInMap: toFolderInMap,
  };
}
