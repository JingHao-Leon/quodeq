const SEP = '/';

/** Every folder prefix of `path`, shortest first, each ending in '/'. */
function folderPrefixes(path) {
  const parts = path.split(SEP);
  const out = [];
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join(SEP) + SEP);
  return out;
}

function countByPrefix(files, areaName) {
  const total = new Map();
  const inArea = new Map();
  for (const f of files) {
    for (const p of folderPrefixes(f.path)) {
      total.set(p, (total.get(p) || 0) + 1);
      if (f.area === areaName) inArea.set(p, (inArea.get(p) || 0) + 1);
    }
  }
  return { total, inArea };
}

/**
 * Workbench path chips for one area: the shortest folder prefixes that hold
 * only this area's files, and exact paths for files in mixed folders.
 * @param {{path: string, area: string}[]} files every file of the run
 * @param {string} areaName
 * @returns {string[]} sorted chips (folders end in '/')
 */
export function areaPathFilters(files, areaName) {
  const { total, inArea } = countByPrefix(files, areaName);
  const chips = new Set();
  for (const f of files) {
    if (f.area !== areaName) continue;
    const pure = folderPrefixes(f.path).find((p) => total.get(p) === inArea.get(p));
    chips.add(pure || f.path);
  }
  return [...chips].sort();
}

/** The folder holding most of `paths` (ties: the shorter, then alphabetical); '' for the root. */
export function largestFolder(paths) {
  const counts = new Map();
  for (const path of paths) {
    const cut = path.lastIndexOf(SEP);
    const folder = cut < 0 ? '' : path.slice(0, cut);
    counts.set(folder, (counts.get(folder) || 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [folder, n] of counts) {
    const better = n > bestCount || (n === bestCount && (folder.length < best.length || (folder.length === best.length && folder < best)));
    if (better) { best = folder; bestCount = n; }
  }
  return best;
}
