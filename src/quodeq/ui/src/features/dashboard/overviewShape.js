/**
 * The Overview's shape the last time a project's page drew (how many
 * dimension cards, whether the "not evaluated yet" line showed), so the next
 * skeleton draws the same footprint and the page does not jump when the
 * cards land. Kept in memory and, when it can, in localStorage.
 */
export const DEFAULT_SHAPE = Object.freeze({ cards: 8, notEvaluated: false, height: null, bottom: null });
const KEY_PREFIX = 'quodeq.overviewShape.';
const MAX_CARDS = 64;
const MAX_HEIGHT_PX = 4000;
const shapes = new Map();

function storage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch (err) {
    console.debug('[overviewShape] localStorage unavailable:', err);
    return null;
  }
}

function validHeight(h) {
  return h === null || h === undefined || (Number.isFinite(h) && h > 0 && h <= MAX_HEIGHT_PX);
}

function valid(shape) {
  return Boolean(shape) && Number.isInteger(shape.cards) && shape.cards > 0 && shape.cards <= MAX_CARDS
    && typeof shape.notEvaluated === 'boolean' && validHeight(shape.height) && validHeight(shape.bottom);
}

const px = (h) => (h ? Math.round(h) : null);

/**
 * Record what a project's Overview just drew: any of `cards`, `notEvaluated`,
 * `height` (the cards block) and `bottom` (Fix first and Where); fields left
 * out keep their last value.
 */
export function rememberShape(project, update) {
  if (!project) return;
  const merged = { ...recallShape(project), ...update };
  if (!valid(merged)) return;
  const clean = { cards: merged.cards, notEvaluated: merged.notEvaluated, height: px(merged.height), bottom: px(merged.bottom) };
  shapes.set(project, clean);
  try {
    storage()?.setItem(KEY_PREFIX + project, JSON.stringify(clean));
  } catch (err) {
    console.debug('[overviewShape] write failed:', err);
  }
}

/** The shape to draw a project's skeleton in: the last one seen, else the default. */
export function recallShape(project) {
  if (!project) return DEFAULT_SHAPE;
  if (shapes.has(project)) return shapes.get(project);
  try {
    const stored = JSON.parse(storage()?.getItem(KEY_PREFIX + project) ?? 'null');
    if (valid(stored)) {
      shapes.set(project, stored);
      return stored;
    }
  } catch (err) {
    console.debug('[overviewShape] read failed:', err);
  }
  return DEFAULT_SHAPE;
}

/** Test seam: forget every remembered shape held in memory. */
export function resetShapes() {
  shapes.clear();
}
