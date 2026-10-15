// Grade-formula draft business rules, applied by useGradeFormula's update()
// funnel before a patch is merged into the draft.
//
// Server-side (analysis/params.py) already enforces the real invariants and
// 400s an invalid save -- this is UI-only DRY, not a port of validate_params:
// it just keeps the two floor sliders from visibly fighting each other while
// the user drags (each slider used to clamp itself inline; centralizing it
// here means every caller of update() gets the same behaviour for free).

/**
 * Keep `floorMinor >= floorMajor` when a patch touches either floor.
 *
 * NO-OP on any patch that doesn't set `floorMinor` or `floorMajor` (e.g. a
 * `gradeThresholds` patch from the boundaries divider) -- returns the patch
 * unchanged. `draft` is the PRE-patch state: an incoming floor clamps against
 * the other floor's value in the patch when the patch carries both, else
 * against its current value in the draft.
 *
 * @param {Object} draft - the pre-patch grade-formula draft state.
 * @param {Object} patch - the incoming patch to merge into the draft.
 * @returns {Object} the patch, clamped when it touches either floor.
 */
export function clampFloors(draft, patch) {
  if (!draft || !patch) return patch;
  if (!('floorMinor' in patch) && !('floorMajor' in patch)) return patch;

  // The other floor is the patch's own when it carries both (Undo all
  // restores a whole saved formula), else the draft's.
  const minor = 'floorMinor' in patch ? patch.floorMinor : draft.floorMinor;
  const major = 'floorMajor' in patch ? patch.floorMajor : draft.floorMajor;
  const next = { ...patch };
  if ('floorMinor' in next) next.floorMinor = Math.max(next.floorMinor, major);
  if ('floorMajor' in next) next.floorMajor = Math.min(next.floorMajor, minor);
  return next;
}

const SEVERITY_STEP = 0.05;
const CENTS = 100; // severity weights are shown and stored to two decimals
const roundStep = (v) => Math.round(v * CENTS) / CENTS;

/**
 * Keep minor < major < critical (the server rejects anything else) when a
 * patch moves a severity weight: the moved weight stops one step short of
 * its neighbour. NO-OP on patches without `severityWeight`.
 *
 * @param {Object} draft - the pre-patch grade-formula draft state.
 * @param {Object} patch - the incoming patch to merge into the draft.
 * @returns {Object} the patch, clamped when it moves a severity weight.
 */
export function clampSeverity(draft, patch) {
  if (!draft || !patch || !patch.severityWeight) return patch;
  const prev = draft.severityWeight;
  const next = { ...patch.severityWeight };
  if (next.minor !== prev.minor) next.minor = roundStep(Math.min(next.minor, next.major - SEVERITY_STEP));
  if (next.major !== prev.major) {
    next.major = roundStep(Math.min(Math.max(next.major, next.minor + SEVERITY_STEP), next.critical - SEVERITY_STEP));
  }
  if (next.critical !== prev.critical) next.critical = roundStep(Math.max(next.critical, next.major + SEVERITY_STEP));
  return { ...patch, severityWeight: next };
}
