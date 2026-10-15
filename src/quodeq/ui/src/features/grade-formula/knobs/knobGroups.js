// The editor's knobs, grouped by the question each group answers. A knob
// reads its value off a params object and patches it immutably; the page,
// the reach counts and the review sheet all go through these definitions.
import { SCORE_SCALE_MAX } from '../../../constants.js';
import { SEVERITY_ORDER } from '../../../vocab/severity.js';
import { GRADE } from '../../../vocab/grade.js';

export const KNOB_GROUP = Object.freeze({
  COST: 'cost', BANDS: 'bands', STEEP: 'steep', LIFT: 'lift', CEIL: 'ceil', FLOOR: 'floor',
});

const SEVERITY = { min: 0.05, max: 10, step: 0.05 };
const BAND_MARGIN = 0.5;
const BAND_STEP = 0.5;
const cap = (s) => s[0].toUpperCase() + s.slice(1);

const severityKnob = (id) => ({
  id, labelKey: `gradeFormula.weight${cap(id)}`, hintKey: `gradeFormula.hint${cap(id)}`,
  ...SEVERITY,
  get: (p) => p.severityWeight[id],
  patch: (p, v) => ({ severityWeight: { ...p.severityWeight, [id]: v } }),
});
const scalarKnob = (id, field, range, keys) => ({
  id, ...range, ...keys, get: (p) => p[field], patch: (_p, v) => ({ [field]: v }),
});
const bandKnob = (label, index) => ({
  id: label, labelKey: `gradeFormula.band${label}`, min: BAND_MARGIN, max: SCORE_SCALE_MAX - BAND_MARGIN, step: BAND_STEP,
  get: (p) => p.gradeThresholds[index][0],
  patch: (p, v) => ({ gradeThresholds: p.gradeThresholds.map(([t, l], i) => [i === index ? v : t, l]) }),
});

const FLOOR_RANGE = { min: 0, max: SCORE_SCALE_MAX, step: BAND_STEP };

export const GROUPS = [
  { id: KNOB_GROUP.COST, titleKey: 'gradeFormula.groupCost', questionKey: 'gradeFormula.groupCostQ', folded: false,
    knobs: SEVERITY_ORDER.map(severityKnob) },
  { id: KNOB_GROUP.BANDS, titleKey: 'gradeFormula.groupBands', questionKey: 'gradeFormula.groupBandsQ', folded: false, labelsOnly: true,
    knobs: [GRADE.EXEMPLARY, GRADE.GOOD, GRADE.ADEQUATE, GRADE.POOR].map(bandKnob) },
  { id: KNOB_GROUP.STEEP, titleKey: 'gradeFormula.groupSteep', questionKey: 'gradeFormula.groupSteepQ', folded: true,
    knobs: [scalarKnob('k', 'baseK', { min: 0.01, max: 1, step: 0.01 },
      { labelKey: 'gradeFormula.knobSteepness', techKey: 'gradeFormula.strictnessK', hintKey: 'gradeFormula.hintStrictness' })] },
  { id: KNOB_GROUP.LIFT, titleKey: 'gradeFormula.groupLift', questionKey: 'gradeFormula.groupLiftQ', folded: true,
    knobs: [scalarKnob('lift', 'liftCompress', { min: 1, max: 4, step: 0.1 },
      { labelKey: 'gradeFormula.knobLiftDamping', techKey: 'gradeFormula.liftCompress', hintKey: 'gradeFormula.hintLift' })] },
  { id: KNOB_GROUP.CEIL, titleKey: 'gradeFormula.groupCeil', questionKey: 'gradeFormula.groupCeilQ', folded: true,
    knobs: [scalarKnob('ceil', 'ceilScale', { min: 0, max: 2, step: 0.05 },
      { labelKey: 'gradeFormula.knobCeilingDrop', techKey: 'gradeFormula.ceilScale', hintKey: 'gradeFormula.hintCeil' })] },
  { id: KNOB_GROUP.FLOOR, titleKey: 'gradeFormula.groupFloor', questionKey: 'gradeFormula.groupFloorQ', folded: true,
    knobs: [
      scalarKnob('floorMinor', 'floorMinor', FLOOR_RANGE, { labelKey: 'gradeFormula.minorOnly', hintKey: 'gradeFormula.hintFloorMinor' }),
      scalarKnob('floorMajor', 'floorMajor', FLOOR_RANGE, { labelKey: 'gradeFormula.floorMajor', hintKey: 'gradeFormula.hintFloorMajor' }),
    ] },
];

/** *params* with one knob set to *value* (a new object; *params* is untouched). */
export function applyKnob(params, knob, value) {
  return { ...params, ...knob.patch(params, value) };
}

/** Every knob whose value differs between *draft* and *saved*, in page order. */
export function knobChanges(draft, saved) {
  const out = [];
  for (const group of GROUPS) {
    for (const knob of group.knobs) {
      const from = knob.get(saved);
      const to = knob.get(draft);
      if (from !== to) out.push({ group, knob, from, to });
    }
  }
  return out;
}
