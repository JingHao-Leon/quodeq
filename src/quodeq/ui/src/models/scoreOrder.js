/**
 * The order score cards read in: weakest first, so the one to open leads
 * (the Overview's dimensions, a dimension page's principles). Pure, no
 * framework imports.
 */

/** A score as a number ("7.4/10" reads 7.4); an ungraded one sorts last. */
const sortScore = (value) => {
  const n = parseFloat(value);
  return Number.isNaN(n) ? Infinity : n;
};

/**
 * A comparator: lowest score first, ungraded ones last, ties by name.
 * @param {(item: object) => *} scoreOf
 * @param {(item: object) => string} nameOf
 * @returns {(a: object, b: object) => number}
 */
export function weakestFirst(scoreOf, nameOf) {
  return (a, b) => (sortScore(scoreOf(a)) - sortScore(scoreOf(b))) || String(nameOf(a)).localeCompare(String(nameOf(b)));
}
