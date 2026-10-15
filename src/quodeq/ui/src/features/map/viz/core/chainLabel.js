// Container folders that say nothing about what a chain holds (as the Map's areas skip them, core/map_history/areas.py).
const GENERIC_SEGMENTS = new Set(['src', 'main', 'kotlin', 'java', 'swift', 'sources', 'lib', 'app', 'test', 'tests', 'androidtest']);
// After kotlin/ or java/ the reverse-domain package root (nl/x/edition) says nothing either.
const JVM_SOURCE_DIRS = new Set(['kotlin', 'java']);
const JVM_PACKAGE_DEPTH = 3;
const SEP = '/';

const lastSegment = (text) => text.slice(text.lastIndexOf(SEP) + 1);

/**
 * The label of a collapsed folder chain `a/b/c`: its first segment that names
 * something (`feature-feed/src` reads "feature-feed"), container folders and
 * a JVM package root passed over; the last segment when every one is a container.
 */
export function chainLabel(name) {
  const text = name || '';
  const segs = text.split(SEP).filter(Boolean);
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i].toLowerCase();
    if (JVM_SOURCE_DIRS.has(seg)) { i += JVM_PACKAGE_DEPTH; continue; }
    if (!GENERIC_SEGMENTS.has(seg)) return segs[i];
  }
  return lastSegment(text);
}

/** A circle's path without a trailing slash (its name when it has no path). */
export function circlePath(data) {
  return (data.path || data.name || '').replace(/\/$/, '');
}

/** A circle's own name, as cards title it: a file's own name, a folder chain's label (chainLabel). */
export function circleTitle(data) {
  if (data.isFile || !data.children) return lastSegment(circlePath(data)) || data.name || '';
  return chainLabel(data.name) || lastSegment(circlePath(data)) || '';
}
