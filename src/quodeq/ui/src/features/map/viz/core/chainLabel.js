/** The label of a collapsed folder chain `a/b/c`: its last segment (spec decision 6.1). */
export function chainLabel(name) {
  const text = name || '';
  return text.slice(text.lastIndexOf('/') + 1);
}

/** A circle's path without a trailing slash (its name when it has no path). */
export function circlePath(data) {
  return (data.path || data.name || '').replace(/\/$/, '');
}

/** A circle's own name, as cards title it: the last segment of its path. */
export function circleTitle(data) {
  return chainLabel(circlePath(data)) || data.name || '';
}
