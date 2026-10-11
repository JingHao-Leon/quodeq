/**
 * Shorter dimension labels: the run log names a partial run's dimensions
 * with these (runLogModel.js `scopeLabel`).
 */
export const DIM_ABBREV = {
  flexibility: 'flex',
  maintainability: 'maint',
  performance: 'perf',
  reliability: 'rel',
  security: 'sec',
  usability: 'usab',
};

const FALLBACK_ABBREV_THRESHOLD = 5;
const FALLBACK_ABBREV_LENGTH = 4;

export function abbrevDim(name) {
  if (!name) return name;
  const lower = String(name).toLowerCase();
  return DIM_ABBREV[lower] || (lower.length > FALLBACK_ABBREV_THRESHOLD ? lower.slice(0, FALLBACK_ABBREV_LENGTH) : lower);
}
