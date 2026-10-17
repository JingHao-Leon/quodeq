// The principle chart's geometry: finding weight across on a log scale
// (weights under the SAVED severity costs, so a principle keeps its column
// while the draft moves it up or down), score 0-10 up.
import { principleScore, gradeOf } from '../scoring/livePreview.js';
import { allPrinciples, GRADE_ORDER } from '../impact/impactModel.js';
import { SCORE_SCALE_MAX } from '../../../constants.js';

const WIDTH = 960;
// Short enough to stay pinned above the knobs at the default window height.
const HEIGHT = 250;
const MARGIN_LEFT = 44;
const MARGIN_RIGHT = 130;
const MARGIN_TOP = 14;
const MARGIN_BOTTOM = 40;
const PLOT = { left: MARGIN_LEFT, right: WIDTH - MARGIN_RIGHT, top: MARGIN_TOP, bottom: HEIGHT - MARGIN_BOTTOM };
const MIN_X_MAX = 48;
const X_HEADROOM = 1.05;
const TICK_FIVE = 5;
const TICK_TEN = 10;
const TICK_TWENTY = 20;
const TICK_FORTY = 40;
const X_TICKS = [0, 1, 2, TICK_FIVE, TICK_TEN, TICK_TWENTY, TICK_FORTY];

/** Which way a dot moved: its score fell, rose or held. */
export const DIR = Object.freeze({ UP: 'up', DOWN: 'down', SAME: 'same' });

export function chartScale(maxWeight) {
  const xMax = Math.max(MIN_X_MAX, maxWeight * X_HEADROOM);
  const span = PLOT.right - PLOT.left;
  return {
    width: WIDTH, height: HEIGHT, plot: PLOT,
    x: (wv) => PLOT.left + (Math.log1p(Math.max(0, wv)) / Math.log1p(xMax)) * span,
    y: (score) => PLOT.top + ((SCORE_SCALE_MAX - score) / SCORE_SCALE_MAX) * (PLOT.bottom - PLOT.top),
    xMax, xTicks: X_TICKS.filter((tick) => tick <= xMax),
  };
}

const weightOf = (p, params) => p.massMinor * params.severityWeight.minor + p.massMajor * params.severityWeight.major
  + p.massCritical * params.severityWeight.critical;

export function maxSavedWeight(inputs, saved) {
  return allPrinciples(inputs).reduce((m, { p }) => Math.max(m, weightOf(p, saved)), 0);
}

function direction(before, after) {
  if (after < before) return DIR.DOWN;
  return after > before ? DIR.UP : DIR.SAME;
}

export function principleDots(inputs, saved, draft) {
  const scale = chartScale(maxSavedWeight(inputs, saved));
  return allPrinciples(inputs).map(({ key, project, dimension, p }) => {
    const before = principleScore(p, saved);
    const after = principleScore(p, draft);
    const flip = GRADE_ORDER.indexOf(gradeOf(before, saved.gradeThresholds)) !== GRADE_ORDER.indexOf(gradeOf(after, draft.gradeThresholds));
    return {
      key, project, dimension, id: p.id, before, after, flip,
      x: scale.x(weightOf(p, saved)), yBefore: scale.y(before), yAfter: scale.y(after),
      dir: direction(before, after),
    };
  });
}
