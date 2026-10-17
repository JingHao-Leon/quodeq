import { t } from '../../strings/index.js';

// Display-name keys for effort levels (from the live model catalog or
// ai_providers.json's `effort_levels`); a level missing here shows its raw id.
const EFFORT_LABEL_KEYS = Object.freeze({
  low: 'settings.effortLow',
  medium: 'settings.effortMedium',
  high: 'settings.effortHigh',
  xhigh: 'settings.effortXhigh',
  max: 'settings.effortMax',
  ultra: 'settings.effortUltra',
});

/** The display name for an effort level, or the raw level when unnamed. */
export function effortLabel(level) {
  const key = EFFORT_LABEL_KEYS[level];
  return key ? t(key) : level;
}

/** The "Default" option's label, naming the model's own default when known. */
export function defaultEffortLabel(defaultEffort) {
  return defaultEffort
    ? t('settings.effortDefaultNamed', { level: effortLabel(defaultEffort) })
    : t('settings.effortDefault');
}
