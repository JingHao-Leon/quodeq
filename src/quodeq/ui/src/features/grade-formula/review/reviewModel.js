import { KNOB_GROUP } from '../knobs/knobGroups.js';

export const REVIEW_MODE = Object.freeze({ APPLY: 'apply', RESET: 'reset' });

const EFFECT_KEY = Object.freeze({
  [KNOB_GROUP.COST]: { up: 'gradeFormula.effectCostUp', down: 'gradeFormula.effectCostDown' },
  [KNOB_GROUP.BANDS]: { up: 'gradeFormula.effectBandsUp', down: 'gradeFormula.effectBandsDown' },
  [KNOB_GROUP.STEEP]: { up: 'gradeFormula.effectSteepUp', down: 'gradeFormula.effectSteepDown' },
  [KNOB_GROUP.LIFT]: { up: 'gradeFormula.effectLiftUp', down: 'gradeFormula.effectLiftDown' },
  [KNOB_GROUP.CEIL]: { up: 'gradeFormula.effectCeilUp', down: 'gradeFormula.effectCeilDown' },
  [KNOB_GROUP.FLOOR]: { up: 'gradeFormula.effectFloorUp', down: 'gradeFormula.effectFloorDown' },
  [KNOB_GROUP.DIMENSIONS]: { up: 'gradeFormula.effectDimensionsUp', down: 'gradeFormula.effectDimensionsDown' },
});
const TOGGLE_EFFECT_KEY = Object.freeze({ on: 'gradeFormula.effectWeightsOn', off: 'gradeFormula.effectWeightsOff' });

/** The catalog key of one sentence saying what a change does. */
export function effectKey(change) {
  if (change.knob?.toggle) return TOGGLE_EFFECT_KEY[change.to ? 'on' : 'off'];
  return EFFECT_KEY[change.group.id][change.to > change.from ? 'up' : 'down'];
}

/** The projects whose grade the server says the target formula changes. */
export function serverFlips(payload, names) {
  return payload.projects
    .filter((p) => p.before.overall.grade !== p.after.overall.grade)
    .map((p) => ({
      id: p.id, name: names[p.id] || p.id, from: p.before.overall.grade, to: p.after.overall.grade,
      before: p.before.overall.score, after: p.after.overall.score,
    }));
}
