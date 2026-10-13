/** The label of a collapsed folder chain `a/b/c`: its last segment (spec decision 6.1). */
export function chainLabel(name) {
  const text = name || '';
  return text.slice(text.lastIndexOf('/') + 1);
}
