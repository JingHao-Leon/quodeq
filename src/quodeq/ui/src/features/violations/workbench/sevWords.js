import { t } from '../../../strings/index.js';
import { SEVERITY } from '../../../vocab/severity.js';

const SEV_ABBR_KEY = Object.freeze({
  [SEVERITY.CRITICAL]: 'violations.wbSevCritical',
  [SEVERITY.MAJOR]: 'violations.wbSevMajor',
  [SEVERITY.MINOR]: 'violations.wbSevMinor',
});

/** Short severity word (crit / maj / min); '' for an unknown level. */
export function sevAbbr(level) {
  const key = SEV_ABBR_KEY[level];
  return key ? t(key) : '';
}
