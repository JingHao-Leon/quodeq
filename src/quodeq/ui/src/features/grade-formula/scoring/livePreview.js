// The Q² scorer, mirrored for the editor's live preview: a principle from its
// unit masses (core/scoring/internals.py principle_stages), a dimension as the
// observation-weighted mean (projector_scoring.compute_dimension_score), a
// project as the dimension-weighted mean (params.dimension_weighted_average).
// Pinned number for number by parity.fixture.json, which
// tests/services/test_grade_formula_parity_fixture.py writes from the Python
// scorer: a formula change that skips this file fails that pair of tests.
import { SCORE_SCALE_MAX } from '../../../constants.js';

const FLOOR = {
  critical: () => 0,
  major: (params) => params.floorMajor,
  minor: (params) => params.floorMinor,
};

const QUARTERS = 4; // x · 4 integral but x · 2 not: x sits on an odd quarter, an exact tie at one decimal
const TENTHS = 10; // one decimal place

/** Python's round(x, 1): an exact half (x · 4 odd, as 7.25) goes to the even tenth. */
export function pyRound1(x) {
  if (Number.isInteger(x * QUARTERS) && !Number.isInteger(x * 2)) {
    const down = Math.floor(x * TENTHS) / TENTHS;
    return Math.round(down * TENTHS) % 2 === 0 ? down : Math.round(down * TENTHS + 1) / TENTHS;
  }
  return Number(x.toFixed(1));
}

function violationMass(p, weights) {
  return p.massMinor * weights.minor + p.massMajor * weights.major + p.massCritical * weights.critical;
}

/** One principle's final score under *params*, from its unit masses. */
export function principleScore(p, params) {
  const wv = violationMass(p, params.severityWeight);
  const base = wv <= 0 ? SCORE_SCALE_MAX : SCORE_SCALE_MAX / (1 + params.baseK * wv);
  const lift = p.complianceMass <= 0 || wv <= 0 ? 0 : (p.complianceMass / (p.complianceMass + wv)) ** params.liftCompress;
  const raw = base + (SCORE_SCALE_MAX - base) * lift;
  const ceiling = wv <= 0 ? SCORE_SCALE_MAX : SCORE_SCALE_MAX - Math.log2(1 + wv) * params.ceilScale;
  const floor = FLOOR[p.worst] ? FLOOR[p.worst](params) : SCORE_SCALE_MAX;
  return pyRound1(Math.min(ceiling, Math.max(floor, raw)));
}

/** A dimension's score: its frozen score, else the observation-weighted mean of its principles. */
export function dimensionScore(dim, params) {
  if (dim.frozenScore != null) return dim.frozenScore;
  if (dim.principles.length === 0) return null;
  const useObservation = dim.principles.some((p) => p.observation > 0);
  let total = 0;
  let weighted = 0;
  for (const p of dim.principles) {
    const w = useObservation ? p.observation : 1;
    total += w;
    weighted += principleScore(p, params) * w;
  }
  return pyRound1(weighted / total);
}

/** The project's score: the dimension-weighted mean of the scored dimensions. */
export function overallScore(dims, params) {
  const scored = dims.filter((d) => d.score != null);
  if (scored.length === 0) return null;
  if (!params.dimensionWeightsEnabled) return pyRound1(scored.reduce((s, d) => s + d.score, 0) / scored.length);
  let total = 0;
  let weighted = 0;
  for (const d of scored) {
    const w = params.dimensionWeights?.[d.dimension] ?? 1;
    total += w;
    weighted += d.score * w;
  }
  return pyRound1(weighted / total);
}

/** The grade label of *score* under *thresholds* ([[9, 'Exemplary'], ...], highest first). */
export function gradeOf(score, thresholds) {
  for (const [threshold, label] of thresholds) if (score >= threshold) return label;
  return 'Critical';
}
