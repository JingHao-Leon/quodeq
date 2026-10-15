/**
 * What the Overview's and the run page's numbers and rows open:
 * every finding view as a scoped Findings view, today's or, for a past run
 * (`asOf`, see overviewAsOf and runAsOf), that run's, read-only.
 * Each is undefined without an `onNavigate`.
 */
import { SCOPE_KIND, openScope, cardFilter } from '../violations/scope/scopeModel.js';

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

/**
 * The areas: an area opens on its findings. The Map measures today's
 * findings, so its areas open today's view even on a past run.
 */
function makeAreaNavigate({ onNavigate }) {
  return onNavigate ? (scope) => openScope(onNavigate, scope) : undefined;
}

/** What the panels below the cards open: a requirement, an area, a folder, a file. */
export function makeFindingsNavigate(args) {
  return { requirement: makeRequirementNavigate(args), area: makeAreaNavigate(args), folder: makeFolderNavigate(args), file: makeFileNavigate(args) };
}
