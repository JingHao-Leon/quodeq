import { t } from '../../../../strings/index.js';
import { PACK_COLOR_MODE } from '../../mapVocab.js';

// Badness within this band either side of zero reads as "about average".
const SIDE_BAND = 0.1;

function changedText(edits) {
  return edits === 1 ? t('map.stateChangedOne') : t('map.stateChanged', { count: edits });
}

/**
 * Screen-reader state of a circle in the current colour mode.
 * @param {{badness: number, edits: number}} paint the circle's CirclePaint
 * @param {string} mode a PACK_COLOR_MODE value; anything else reads as concentration
 * @returns {string}
 */
export function packStateText(paint, mode) {
  if (mode === PACK_COLOR_MODE.ACTIVITY) return changedText(paint.edits);
  if (paint.badness > SIDE_BAND) return t('map.stateWorse');
  return paint.badness < -SIDE_BAND ? t('map.stateBetter') : t('map.stateAverage');
}
