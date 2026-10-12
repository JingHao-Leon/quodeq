import { t } from '../../../strings/index.js';
import { SEVERITY, SEVERITY_ORDER } from '../../../vocab/severity.js';

const ABBR_KEY = {
  [SEVERITY.CRITICAL]: 'history.sevCritical',
  [SEVERITY.MAJOR]: 'history.sevMajor',
  [SEVERITY.MINOR]: 'history.sevMinor',
};

/** A severity's short word ("maj"), or '' for an unknown level. */
export const sevAbbr = (level) => (ABBR_KEY[level] ? t(ABBR_KEY[level]) : '');

/** Severity counts as quiet text (`13 maj · 2 crit`); the red badges stay on the hero. */
export default function RunSevText({ counts, levels = SEVERITY_ORDER }) {
  const parts = levels.filter((l) => counts?.[l] > 0).map((l) => t('history.sevCount', { count: counts[l], sev: sevAbbr(l) }));
  if (!parts.length) return null;
  return <span className="rl-sevtext">{parts.join(' · ')}</span>;
}
