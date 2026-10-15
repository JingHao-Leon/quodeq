/**
 * A dimension's, principle's or area's name as a lookup key: the same name
 * whatever its case (reports, run comparisons and the Map spell them
 * differently), and '' for none.
 * @param {*} name
 * @returns {string}
 */
export function nameKey(name) {
  return String(name ?? '').toLowerCase();
}
