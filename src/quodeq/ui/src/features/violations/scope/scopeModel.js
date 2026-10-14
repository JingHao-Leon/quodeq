import { buildProjectRootFile } from '../../../utils/explorerUtils.js';
import { SEVERITY_ORDER } from '../../../vocab/severity.js';
import { FINDING_TYPE } from '../../../vocab/findingType.js';
import { NAV_TAB } from '../../../vocab/navTab.js';
import { t } from '../../../strings/index.js';

/** What a scoped Findings view is about. */
export const SCOPE_KIND = Object.freeze({
  FILE: 'file', FOLDER: 'folder', DIMENSION: 'dimension', REQUIREMENT: 'requirement', PROJECT: 'project', AREA: 'area', PRINCIPLE: 'principle',
});
const KINDS = new Set(Object.values(SCOPE_KIND));
/** The kinds a scope can open filtered to: a severity, or the compliant checks. */
const FILTERS = new Set([...SEVERITY_ORDER, FINDING_TYPE.COMPLIANCE]);
const SLASH = '/';

const isText = (x) => typeof x === 'string' && x.length > 0;
const textList = (x) => (Array.isArray(x) ? x.filter(isText) : []);

/** The fields each kind needs, read from a navigation param. */
const READERS = {
  [SCOPE_KIND.FILE]: (p) => (isText(p.path) ? { path: p.path } : null),
  [SCOPE_KIND.FOLDER]: (p) => (isText(p.path) ? { path: p.path.replace(/\/+$/, '') } : null),
  [SCOPE_KIND.DIMENSION]: (p) => (isText(p.dimension) ? { dimension: p.dimension } : null),
  [SCOPE_KIND.REQUIREMENT]: (p) => (isText(p.dimension) && isText(p.req) ? { dimension: p.dimension, req: p.req, text: isText(p.text) ? p.text : '' } : null),
  [SCOPE_KIND.PROJECT]: () => ({}),
  [SCOPE_KIND.PRINCIPLE]: (p) => (isText(p.dimension) && isText(p.principle) ? { dimension: p.dimension, principle: p.principle } : null),
  [SCOPE_KIND.AREA]: (p) => (isText(p.name) && textList(p.paths).length ? { name: p.name, paths: textList(p.paths), small: p.small === true } : null),
};

/**
 * The `scope` navigation param: `{kind, ...fields, filter?}`, `filter` a
 * severity or 'compliance' the view opens on; null when absent or malformed.
 */
export function readScope(param) {
  if (!param || typeof param !== 'object' || !KINDS.has(param.kind)) return null;
  const fields = READERS[param.kind](param);
  if (!fields) return null;
  return { kind: param.kind, ...fields, filter: FILTERS.has(param.filter) ? param.filter : null };
}

/** A path test for a list of chips: a trailing '/' is a folder (everything under it), else an exact file. */
function underAny(paths) {
  const files = new Set(paths.filter((p) => !p.endsWith(SLASH)));
  const folders = paths.filter((p) => p.endsWith(SLASH));
  return (file) => files.has(file) || folders.some((p) => (file || '').startsWith(p));
}

/** What each kind keeps of a dimension's findings (`item`, of dimension `dim`). */
const KEEPS = {
  [SCOPE_KIND.FILE]: (s) => (item) => item.file === s.path,
  [SCOPE_KIND.FOLDER]: (s) => (item) => (item.file || '').startsWith(`${s.path}${SLASH}`),
  [SCOPE_KIND.DIMENSION]: (s) => (item, dim) => dim.dimension === s.dimension,
  [SCOPE_KIND.REQUIREMENT]: (s) => (item, dim) => dim.dimension === s.dimension && item.req === s.req,
  [SCOPE_KIND.PROJECT]: () => () => true,
  [SCOPE_KIND.PRINCIPLE]: (s) => (item, dim) => dim.dimension === s.dimension && item.principle === s.principle,
  [SCOPE_KIND.AREA]: (s) => { const inArea = underAny(s.paths); return (item) => inArea(item.file); },
};

/** The scope's title: the file or folder path, the dimension, the requirement and its text, the project, the area. */
function titleOf(scope, projectName) {
  if (scope.kind === SCOPE_KIND.FOLDER) return `${scope.path}${SLASH}`;
  if (scope.kind === SCOPE_KIND.REQUIREMENT) return scope.text ? `${scope.req} · ${scope.text}` : scope.req;
  if (scope.kind === SCOPE_KIND.PROJECT) return projectName || SCOPE_KIND.PROJECT;
  return scope.principle || scope.path || scope.dimension || scope.name;
}

/** A principle scope's score, grade and evidence confidence, from its dimension's principle rows; null for other kinds. */
export function principleGradeOf(scope, dims) {
  if (scope.kind !== SCOPE_KIND.PRINCIPLE) return null;
  const dim = (dims || []).find((d) => d.dimension === scope.dimension);
  return (dim?.principles || []).find((p) => (p.name ?? p.principle) === scope.principle) || null;
}

/**
 * The scope's findings as the cards read them (the File page's object:
 * violations by severity, compliance, counts, dimensions), built from the
 * dimensions on show; null when the scope holds nothing.
 * @param {object} scope readScope output
 * @param {object[]} dims the visible dimensions (violations and compliance)
 * @param {string} [projectName]
 */
export function scopeFindings(scope, dims, projectName) {
  const keep = KEEPS[scope.kind](scope);
  const narrowed = (dims || [])
    .map((d) => ({ ...d, violations: (d.violations || []).filter((i) => keep(i, d)), compliance: (d.compliance || []).filter((i) => keep(i, d)) }))
    .filter((d) => d.violations.length || d.compliance.length);
  if (!narrowed.length) return null;
  return buildProjectRootFile(narrowed, titleOf(scope, projectName));
}

/** The workbench filters that show a scope as a list: its path or area chip, its dimension, its rule. */
export function scopeAsList(scope) {
  if (scope.kind === SCOPE_KIND.FILE) return { paths: [scope.path] };
  if (scope.kind === SCOPE_KIND.FOLDER) return { paths: [`${scope.path}${SLASH}`] };
  if (scope.kind === SCOPE_KIND.AREA) return { area: { name: scope.name, paths: scope.paths } };
  if (scope.kind === SCOPE_KIND.DIMENSION) return { dimension: scope.dimension };
  if (scope.kind === SCOPE_KIND.REQUIREMENT) return { dimension: scope.dimension, q: scope.req };
  return {};
}

/** The breadcrumb's name of each kind: the file's name, the folder's path, the dimension, the requirement, the project, the area. */
const LABELS = {
  [SCOPE_KIND.FILE]: (s) => s.path.split(SLASH).pop(),
  [SCOPE_KIND.FOLDER]: (s) => `${s.path}${SLASH}`,
  [SCOPE_KIND.DIMENSION]: (s) => s.dimension.toLowerCase(),
  [SCOPE_KIND.REQUIREMENT]: (s) => s.req,
  [SCOPE_KIND.PROJECT]: () => t('violations.scopeKind_project'),
  [SCOPE_KIND.AREA]: (s) => s.name,
  [SCOPE_KIND.PRINCIPLE]: (s) => s.principle.toLowerCase(),
};

/** A `scope` navigation param as its breadcrumb reads; null when it is no scope. */
export function scopeLabel(param) {
  const scope = readScope(param);
  return scope ? LABELS[scope.kind](scope) : null;
}

/**
 * Open a scoped Findings view as a new navigation step, so Back returns to
 * where it was opened. `scope` is `{kind, ...fields, filter?}`; `asOf` names
 * a past run (`{runId, day}`) and opens it read-only, null opens today.
 * @returns {boolean} whether it navigated
 */
export function openScope(onNavigate, scope, asOf = null) {
  if (!onNavigate) return false;
  onNavigate(NAV_TAB.VIOLATIONS, { scope, asOf: asOf || null });
  return true;
}
