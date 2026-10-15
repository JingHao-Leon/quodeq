/**
 * Where a run came from (its `origin` in the run log: CI, the app, the
 * CLI), as the History run log and the run page name it. Pure functions,
 * no framework imports.
 */

const ORIGIN_KIND = { CI: 'ci', APP: 'app', CLI: 'cli' };
const NIGHTLY = /nightly/i;
const NIGHTLY_LABEL = 'nightly';
const CI_LABEL = 'ci';

/** A CI run: its pull request, a nightly, or its workflow. */
function ciLabel(origin) {
  if (Number.isInteger(origin.pr)) return `PR #${origin.pr}`;
  if (NIGHTLY.test(origin.workflow || '')) return NIGHTLY_LABEL;
  return origin.workflow || CI_LABEL;
}

/**
 * The run's origin in a word or two (`nightly`, `PR #1402`, `app`, `cli`);
 * null when unknown.
 * @param {?{kind: string, pr?: number, workflow?: string}} origin
 * @returns {?string}
 */
export function originLabel(origin) {
  if (!origin) return null;
  if (origin.kind === ORIGIN_KIND.CI) return ciLabel(origin);
  if (origin.kind === ORIGIN_KIND.APP || origin.kind === ORIGIN_KIND.CLI) return origin.kind;
  return null;
}

/** The run's page on GitHub (its pull request, else its workflow run); null when none. */
export function originUrl(origin) {
  return origin?.prUrl || origin?.runUrl || null;
}
