/**
 * What the Overview's and the run page's numbers, rows and movers open:
 * every finding view as a scoped Findings view, today's or, for a past run
 * (`asOf`, see overviewAsOf and runAsOf), that run's, read-only; a mover
 * its dimension. Each is undefined without an `onNavigate`.
 */
import { SCOPE_KIND, openScope, cardFilter } from '../violations/scope/scopeModel.js';
import { nameKey } from '../../utils/nameKey.js';

/** The header tiles: the project's findings, opened on the tile's severity or on the compliant checks. */
export function makeCardNavigate({ onNavigate, asOf }) {
  if (!onNavigate) return undefined;
  return (kind) => openScope(onNavigate, { kind: SCOPE_KIND.PROJECT, filter: cardFilter(kind) }, asOf);
}

/** Fix first: a requirement opens on its findings. */
function makeRequirementNavigate({ onNavigate, asOf }) {
  if (!onNavigate) return undefined;
  return (row) => openScope(onNavigate, { kind: SCOPE_KIND.REQUIREMENT, dimension: row.dimension, req: row.req, text: row.text }, asOf);
}

/** Where the findings live: a folder opens on its findings. */
function makeFolderNavigate({ onNavigate, asOf }) {
  if (!onNavigate) return undefined;
  return (row) => openScope(onNavigate, { kind: SCOPE_KIND.FOLDER, path: row.dir }, asOf);
}

/** Violations by file: a file opens on its findings. */
function makeFileNavigate({ onNavigate, asOf }) {
  if (!onNavigate) return undefined;
  return (f) => openScope(onNavigate, { kind: SCOPE_KIND.FILE, path: f.file }, asOf);
}

/** What the panels below the cards open: a requirement, a folder, a file. */
export function makeFindingsNavigate(args) {
  return { requirement: makeRequirementNavigate(args), folder: makeFolderNavigate(args), file: makeFileNavigate(args) };
}

/** The dimension a mover's name (lowercase) opens, if one is on show. */
export function moverNavigate(sorted, onDimensionClick) {
  if (!onDimensionClick) return undefined;
  return (name) => { const d = sorted.find((x) => nameKey(x.dimension) === name); if (d) onDimensionClick(d); };
}
