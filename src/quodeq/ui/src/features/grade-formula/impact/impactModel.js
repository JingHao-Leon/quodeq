// What a draft formula does to the reader's projects, from the scoring
// inputs (GET /api/grade-formula/inputs) and the browser scorer: every
// project before and after, which principles move and cross a grade, the
// grade distribution, and how far one knob group reaches on its own.
import { principleScore, dimensionScore, overallScore, gradeOf } from '../scoring/livePreview.js';
import { applyKnob } from '../knobs/knobGroups.js';
import { GRADE } from '../../../vocab/grade.js';

export const GRADE_ORDER = [GRADE.EXEMPLARY, GRADE.GOOD, GRADE.ADEQUATE, GRADE.POOR, 'Critical'];

function scoreProject(project, params) {
  const dims = project.dimensions.map((d) => ({ dimension: d.dimension, score: dimensionScore(d, params) }));
  const overall = overallScore(dims, params);
  return { overall, grade: overall == null ? null : gradeOf(overall, params.gradeThresholds), dims };
}

/** Every project's name, score and grade under the saved formula and the draft. */
export function projectImpact(inputs, names, saved, draft) {
  return inputs.projects.map((project) => {
    const before = scoreProject(project, saved);
    const after = scoreProject(project, draft);
    return { id: project.id, name: names[project.id] || project.id, before, after, flips: before.grade !== after.grade };
  });
}

/** Every scored principle with where it lives. */
export function allPrinciples(inputs) {
  const out = [];
  for (const project of inputs.projects) {
    for (const dim of project.dimensions) {
      for (const p of dim.principles) out.push({ key: `${project.id}/${dim.dimension}/${p.id}`, project: project.id, dimension: dim.dimension, p });
    }
  }
  return out;
}

const rank = (label) => GRADE_ORDER.indexOf(label);

/** How many principles change score, and how many move up or down a grade. */
export function principleShifts(inputs, saved, draft) {
  let moved = 0;
  let up = 0;
  let down = 0;
  for (const { p } of allPrinciples(inputs)) {
    const a = principleScore(p, saved);
    const b = principleScore(p, draft);
    if (a !== b) moved += 1;
    const delta = rank(gradeOf(b, draft.gradeThresholds)) - rank(gradeOf(a, saved.gradeThresholds));
    if (delta < 0) up += 1;
    if (delta > 0) down += 1;
  }
  return { moved, up, down };
}

/** How many principles hold each grade under *params*. */
export function gradeDistribution(inputs, params) {
  const counts = Object.fromEntries(GRADE_ORDER.map((g) => [g, 0]));
  for (const { p } of allPrinciples(inputs)) counts[gradeOf(principleScore(p, params), params.gradeThresholds)] += 1;
  return counts;
}

/**
 * How many principles one group moves on its own: the saved formula with
 * only that group's draft values. The bands group moves labels, not scores.
 */
export function groupReach(group, inputs, saved, draft) {
  const params = group.knobs.reduce((acc, knob) => applyKnob(acc, knob, knob.get(draft)), saved);
  let count = 0;
  for (const { p } of allPrinciples(inputs)) {
    const before = principleScore(p, saved);
    const changed = group.labelsOnly
      ? gradeOf(before, saved.gradeThresholds) !== gradeOf(before, params.gradeThresholds)
      : principleScore(p, params) !== before;
    if (changed) count += 1;
  }
  return count;
}
