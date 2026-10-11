import { scorePairs, visibleDetailsOf } from '../../../utils/scoreFiltering.js';
import { weightedMeanScore } from '../../../utils/dimensionWeights.js';
import { scoreToGradeLabel } from '../../../utils/gradeThresholds.js';

const sum = (details, key) => details.reduce((n, d) => n + (Number.isFinite(d[key]) ? d[key] : 0), 0);

/**
 * One log run narrowed to the visible standards, the way the trend is
 * (scoreFiltering's projectEntry): dimensions and their details narrowed,
 * score and grade recomputed from what is left, criticals and majors summed
 * from it (majors only, criticals excluded, per the run log contract). The
 * new and resolved totals stay whole-run: the server knows no visibility.
 * Null when no dimension of the run is visible.
 */
export function visibleRun(run, visibleSet) {
  const all = run.dimensionDetails || [];
  const details = visibleDetailsOf(run, visibleSet);
  if (details.length === all.length) return run;
  if (!details.length) return null;
  const score = weightedMeanScore(scorePairs(details));
  return {
    ...run,
    dims: (run.dims || []).filter((d) => visibleSet.has(d.toLowerCase())),
    dimensionDetails: details,
    score,
    grade: scoreToGradeLabel(score),
    critical: sum(details, 'critical'),
    majors: sum(details, 'majors'),
  };
}

/** The log's runs narrowed to the visible standards; runs with none visible drop out. */
export function runsForVisibleStandards(runs, visibleSet) {
  if (!visibleSet) return runs;
  return runs.map((r) => visibleRun(r, visibleSet)).filter(Boolean);
}
