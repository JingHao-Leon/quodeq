/**
 * Folder browsing for the findings workbench: one level of a file tree at a
 * time (subfolders with their counts, then the files directly in it), and
 * the path suggestions the search offers.
 */
import { SEVERITY } from '../../../vocab/severity.js';
import { FINDING_GROUP } from '../violationsVocab.js';
import { groupFindings } from './workbenchModel.js';

const SEP = '/';
const MIN_QUERY = 2;
const DEFAULT_MAX = 8;
// A path deeper than this is not walked any further by collapseSingle.
const MAX_COLLAPSE_DEPTH = 32;

export function parentFolder(file) {
  const cut = (file || '').lastIndexOf(SEP);
  return cut > 0 ? file.slice(0, cut + 1) : null;
}

/** Every folder a file sits in, outermost first: 'a/b/c.py' -> ['a/', 'a/b/']. */
function foldersOf(file) {
  const parts = file.split(SEP);
  return parts.slice(0, -1).map((_, i) => `${parts.slice(0, i + 1).join(SEP)}${SEP}`);
}

export function pathSuggestions(findings, q, max = DEFAULT_MAX) {
  const needle = String(q || '').trim().toLowerCase();
  if (needle.length < MIN_QUERY) return [];
  const counts = new Map();
  const bump = (p) => counts.set(p, (counts.get(p) || 0) + 1);
  findings.forEach(({ file }) => {
    if (!file) return;
    if (file.toLowerCase().includes(needle)) bump(file);
    foldersOf(file).filter((d) => d.toLowerCase().includes(needle)).forEach(bump);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max);
}

function emptyCount(path) {
  return { path, total: 0, [SEVERITY.CRITICAL]: 0, [SEVERITY.MAJOR]: 0, [SEVERITY.MINOR]: 0 };
}

const worstFolderFirst = (a, b) => (b[SEVERITY.CRITICAL] - a[SEVERITY.CRITICAL])
  || (b[SEVERITY.MAJOR] - a[SEVERITY.MAJOR]) || (b.total - a.total) || a.path.localeCompare(b.path);

export function folderLevel(findings, dir) {
  const subs = new Map();
  const direct = [];
  findings.forEach((f) => {
    if (!f.file) { if (!dir) direct.push(f); return; }
    if (!f.file.startsWith(dir)) return;
    const rest = f.file.slice(dir.length);
    const cut = rest.indexOf(SEP);
    if (cut === -1) { direct.push(f); return; }
    const sub = `${dir}${rest.slice(0, cut + 1)}`;
    const c = subs.get(sub) || emptyCount(sub);
    c.total += 1;
    if (f.severity in c) c[f.severity] += 1;
    subs.set(sub, c);
  });
  return { folders: [...subs.values()].sort(worstFolderFirst), files: groupFindings(direct, FINDING_GROUP.FILE) };
}

export function collapseSingle(findings, dir) {
  let current = dir;
  for (let i = 0; i < MAX_COLLAPSE_DEPTH; i += 1) {
    const { folders, files } = folderLevel(findings, current);
    if (folders.length !== 1 || files.length) return current;
    current = folders[0].path;
  }
  return current;
}
