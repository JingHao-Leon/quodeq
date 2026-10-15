/**
 * What the Overview's and the run page's numbers, rows and movers open:
 * every finding view as a scoped Findings view, today's or, for a past run
 * (`asOf`, see overviewAsOf and runAsOf), that run's, read-only; a mover
 * its dimension. Each is undefined without an `onNavigate`.
 */
import { SCOPE_KIND, openScope, cardFilter } from '../violations/scope/scopeModel.js';
import { nameKey } from '../../utils/nameKey.js';

/**
 * What opens a scoped Findings view from a row: the view of the scope
 * `scopeOf` builds for the row, as of `asOf`; undefined without an `onNavigate`.
 */
function scopeOpener(scopeOf) {
  return ({ onNavigate, asOf }) => (onNavigate ? (row) => openScope(onNavigate, scopeOf(row), asOf) : undefined);
}

/** The header tiles: the project's findings, opened on the tile's severity or on the compliant checks. */
export const makeCardNavigate = scopeOpener((kind) => ({ kind: SCOPE_KIND.PROJECT, filter: cardFilter(kind) }));

/** Fix first: a requirement opens on its findings. */
const makeRequirementNavigate = scopeOpener((row) => ({ kind: SCOPE_KIND.REQUIREMENT, dimension: row.dimension, req: row.req, text: row.text }));

/** Where the findings live: a folder opens on its findings. */
const makeFolderNavigate = scopeOpener((row) => ({ kind: SCOPE_KIND.FOLDER, path: row.dir }));

/** Violations by file: a file opens on its findings. */
const makeFileNavigate = scopeOpener((f) => ({ kind: SCOPE_KIND.FILE, path: f.file }));

/** What the panels below the cards open: a requirement, a folder, a file. */
export function makeFindingsNavigate(args) {
  return { requirement: makeRequirementNavigate(args), folder: makeFolderNavigate(args), file: makeFileNavigate(args) };
}

/** The dimension a mover's name (lowercase) opens, if one is on show. */
export function moverNavigate(sorted, onDimensionClick) {
  if (!onDimensionClick) return undefined;
  return (name) => { const d = sorted.find((x) => nameKey(x.dimension) === name); if (d) onDimensionClick(d); };
}
