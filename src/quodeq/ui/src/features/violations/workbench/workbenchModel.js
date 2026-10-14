/**
 * The findings workbench's pure model: one flat list of the open findings of
 * the visible dimensions and the dismissed ones, and the filters and groups
 * the screen derives from it.
 */
import { SEVERITY, SEVERITY_ORDER } from '../../../vocab/severity.js';
import { FINDING_GROUP, FINDING_STATUS } from '../violationsVocab.js';

const UNKNOWN_RANK = SEVERITY_ORDER.length;
const FOLDER_SUFFIX = '/';
const KEY_SEP = ' · ';

const rank = (severity) => {
  const i = SEVERITY_ORDER.indexOf(severity);
  return i === -1 ? UNKNOWN_RANK : i;
};

const bySeverityThenTitle = (a, b) => rank(a.severity) - rank(b.severity)
  || String(a.title || '').localeCompare(String(b.title || ''));

function toFinding(raw, { status, dimension, runId }) {
  return {
    status, dimension, runId,
    principle: raw.practiceId || raw.principle || '',
    req: raw.req || '', title: raw.title || '', severity: raw.severity,
    file: raw.file || '', line: raw.line ?? null, raw,
  };
}

/** A stable id from what the finding is; repeats of the same finding get #2, #3. */
function withIds(findings) {
  const seen = new Map();
  return findings.map((f) => {
    const base = [f.status, f.dimension, f.file, f.line, f.req, f.title].join('|');
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return { ...f, id: n === 1 ? base : `${base}#${n}` };
  });
}

// A dismissed record without a dimension covers its place in every dimension.
const ANY_DIMENSION = '*';
const placeOf = (dimension, f) => [dimension, f.req, f.file, f.line].join('|');

/** True when a dismissed record sits where `f` does (its dimension when it names one, rule, file, line). */
function coveredBy(closed) {
  const places = new Set(closed.map((c) => placeOf(c.dimension || ANY_DIMENSION, c)));
  return (f) => places.has(placeOf(f.dimension, f)) || places.has(placeOf(ANY_DIMENSION, f));
}

/**
 * Open findings of `dims` plus the `dismissed` records, most severe first. An
 * open finding a dismissed record covers is left out: the dismiss lands in
 * the dismissed list at once, the open payload only on the next refetch.
 */
export function flattenFindings(dims, dismissed) {
  const closed = (dismissed || []).map((raw) => toFinding(raw, {
    status: FINDING_STATUS.DISMISSED, dimension: raw.dimension || '', runId: null,
  }));
  const covered = coveredBy(closed);
  const open = (dims || []).flatMap((d) => (d.violations || []).map((raw) => toFinding(raw, {
    status: FINDING_STATUS.OPEN, dimension: d.dimension, runId: d.fromRunId ?? null,
  }))).filter((f) => !covered(f));
  return withIds([...open, ...closed].sort(bySeverityThenTitle));
}

/** The findings in `status` (every one for all): what `N of M` and the severity counts count over. */
export function statusPool(findings, status) {
  return status === FINDING_STATUS.ALL ? findings : findings.filter((f) => f.status === status);
}

const underPath = (file, path) => (path.endsWith(FOLDER_SUFFIX) ? file.startsWith(path) : file === path);

/** A file test for an area's chips, built once: exact files in a set, folders as prefixes. */
function areaMatcher(area) {
  if (!area) return () => true;
  const files = new Set(area.paths.filter((p) => !p.endsWith(FOLDER_SUFFIX)));
  const folders = area.paths.filter((p) => p.endsWith(FOLDER_SUFFIX));
  return (file) => files.has(file) || folders.some((p) => file.startsWith(p));
}

/** Status, severity and dimension: the menus' exact matches. */
const matchesMenus = (f, { status, severity, dimension }) => (status === FINDING_STATUS.ALL || f.status === status)
  && (!severity || f.severity === severity)
  && (!dimension || f.dimension === dimension);

const matchesText = (f, needle) => !needle || [f.title, f.file, f.req, f.principle].some((x) => x.toLowerCase().includes(needle));

/** The findings the filters leave. Text is a plain, case-insensitive substring. */
export function applyFilters(findings, { q, severity, dimension, status, paths, area }) {
  const needle = String(q || '').trim().toLowerCase();
  const inArea = areaMatcher(area);
  const onPaths = (file) => !paths?.length || paths.some((p) => underPath(file, p));
  return findings.filter((f) => matchesMenus(f, { status, severity, dimension }) && onPaths(f.file) && inArea(f.file) && matchesText(f, needle));
}

const GROUP_KEY = Object.freeze({
  [FINDING_GROUP.REQUIREMENT]: (f) => [f.req, f.principle].filter(Boolean).join(KEY_SEP),
  [FINDING_GROUP.FILE]: (f) => f.file,
  [FINDING_GROUP.DIMENSION]: (f) => f.dimension,
});

/** One group per key, the group with the most severe finding first, then the largest. */
export function groupFindings(findings, group) {
  const keyOf = GROUP_KEY[group];
  if (!keyOf) return [{ key: null, items: findings }];
  const groups = new Map();
  findings.forEach((f) => {
    const k = keyOf(f);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  });
  return [...groups.entries()]
    .map(([key, items]) => ({ key, items }))
    .sort((a, b) => rank(a.items[0].severity) - rank(b.items[0].severity) || b.items.length - a.items.length);
}

export function severityCounts(findings) {
  const counts = { [SEVERITY.CRITICAL]: 0, [SEVERITY.MAJOR]: 0, [SEVERITY.MINOR]: 0 };
  findings.forEach((f) => { if (f.severity in counts) counts[f.severity] += 1; });
  return counts;
}
