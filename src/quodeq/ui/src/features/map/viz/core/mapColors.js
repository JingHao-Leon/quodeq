
const RATE_HIGH = 0.9;
const RATE_MEDIUM = 0.7;
const RATE_LOW = 0.4;

// Cell background tint: how much of the severity/compliance colour shows
// through before it fades to transparent.
const CELL_BG_MIX_PCT = 22;

// One entry per colour bucket: the text/fill colour, the cell background and
// the border. severityColor, severityBorderColor and severityCellStyle are
// the same lookup read through different fields, and the compliance entry is
// the no-violations fallback.
const BUCKETS = {
  critical: { color: 'var(--color-sev-critical-text)', background: `color-mix(in srgb, var(--color-sev-critical-text) ${CELL_BG_MIX_PCT}%, transparent)`, borderColor: 'var(--color-sev-critical-border)' },
  major: { color: 'var(--color-sev-major-text)', background: `color-mix(in srgb, var(--color-sev-major-text) ${CELL_BG_MIX_PCT}%, transparent)`, borderColor: 'var(--color-sev-major-border)' },
  minor: { color: 'var(--color-sev-minor-text)', background: `color-mix(in srgb, var(--color-sev-minor-text) ${CELL_BG_MIX_PCT}%, transparent)`, borderColor: 'var(--color-sev-minor-border)' },
  compliance: { color: 'var(--color-compliance)', background: `color-mix(in srgb, var(--color-compliance) ${CELL_BG_MIX_PCT}%, transparent)`, borderColor: 'var(--color-compliance-border)' },
};

// The compliance-rate ladder, best first: a rate at or above the threshold
// takes that bucket, anything below them all is critical.
const RATE_BUCKETS = [
  [RATE_HIGH, BUCKETS.compliance],
  [RATE_MEDIUM, BUCKETS.minor],
  [RATE_LOW, BUCKETS.major],
];

function severityBucket(severity) {
  return BUCKETS[severity] || BUCKETS.compliance;
}

function rateBucket(rate) {
  for (const [min, bucket] of RATE_BUCKETS) {
    if (rate >= min) return bucket;
  }
  return BUCKETS.critical;
}

export function severityColor(severity) {
  return severityBucket(severity).color;
}

export function complianceRateColor(rate) {
  return rateBucket(rate).color;
}

export function severityCellStyle(sev) {
  return BUCKETS[sev] || null;
}

export function complianceRateCellStyle(rate) {
  return rateBucket(rate);
}

export function healthColor(complianceRate) {
  return complianceRateColor(complianceRate);
}

export function worstSeverity(severity) {
  if (!severity) return null;
  if (severity.critical > 0) return 'critical';
  if (severity.major > 0) return 'major';
  if (severity.minor > 0) return 'minor';
  return null;
}
