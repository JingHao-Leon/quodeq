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

/** Open findings of `dims` plus the `dismissed` records, most severe first. */
export function flattenFindings(dims, dismissed) {
  const open = (dims || []).flatMap((d) => (d.violations || []).map((raw) => toFinding(raw, {
    status: FINDING_STATUS.OPEN, dimension: d.dimension, runId: d.fromRunId ?? null,
  })));
  const closed = (dismissed || []).map((raw) => toFinding(raw, {
    status: FINDING_STATUS.DISMISSED, dimension: raw.dimension || '', runId: null,
  }));
  return withIds([...open, ...closed].sort(bySeverityThenTitle));
}

const underPath = (file, path) => (path.endsWith(FOLDER_SUFFIX) ? file.startsWith(path) : file === path);

/** The findings the filters leave. Text is a plain, case-insensitive substring. */
export function applyFilters(findings, { q, severity, dimension, status, paths }) {
  const needle = String(q || '').trim().toLowerCase();
  return findings.filter((f) => (status === FINDING_STATUS.ALL || f.status === status)
    && (!severity || f.severity === severity)
    && (!dimension || f.dimension === dimension)
    && (!paths?.length || paths.some((p) => underPath(f.file, p)))
    && (!needle || [f.title, f.file, f.req, f.principle].some((x) => x.toLowerCase().includes(needle))));
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
