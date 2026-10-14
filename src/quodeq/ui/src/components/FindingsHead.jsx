import { TermHeader, SevBadge } from './terminal/index.js';
import { ScoreGauge, InsufficientGauge, computeGaugeRing } from './ScoreGauge.jsx';
import { SEVERITY, SEVERITY_ORDER } from '../vocab/severity.js';
import { RISK_ZONE } from '../vocab/riskZone.js';
import { RISK_SMALL } from '../models/findingMetrics.js';
import { t } from '../strings/index.js';

const NO_VALUE = '-';
const fixed1 = (n) => (n == null ? NO_VALUE : n.toFixed(1));
const DENSITY_DECIMALS = 2;
const ZONE_NAME_KEY = {
  [RISK_ZONE.FIX_FIRST]: 'map.riskZoneNameFixFirst', [RISK_ZONE.WATCH]: 'map.riskZoneNameWatch', [RISK_ZONE.HEALTHY]: 'map.riskZoneNameHealthy',
};

/**
 * One number of the header: a small label, the value, a muted line under it.
 * With `onClick` the tile opens something: its label and value are the
 * button, stretched over the tile, and the line under it sits beside the
 * button so the badges it may hold stay buttons of their own.
 */
function HeadStat({ label, value, sub, alarm = false, onClick, ariaLabel }) {
  const top = (
    <>
      <span className="findings-head__label">{label}</span>
      <span className={`findings-head__value${alarm ? ' findings-head__value--alarm' : ''}`}>{value}</span>
    </>
  );
  const under = <span className="findings-head__sub">{sub}</span>;
  if (!onClick) return <div className="findings-head__stat">{top}{under}</div>;
  return (
    <div className="findings-head__stat findings-head__stat--link">
      <button type="button" className="findings-head__hit" onClick={onClick} aria-label={ariaLabel}>{top}</button>
      {under}
    </div>
  );
}

/** The violations' severities as the app's badges, most severe first, with their change when there is one. */
function SevBadges({ sevCounts, deltas, onSeverity }) {
  return SEVERITY_ORDER.filter((sev) => sevCounts[sev] || deltas?.[sev]).map((sev) => (
    <SevBadge key={sev} level={sev} count={sevCounts[sev] || 0} delta={deltas?.[sev]} format="count-abbr"
      onClick={onSeverity ? () => onSeverity(sev) : undefined} />
  ));
}

/** The Risk tile: the zone the weighted issues per file put a folder or area in, or too small to judge. */
function RiskStat({ risk }) {
  if (risk.zone === RISK_SMALL) {
    return <HeadStat label={t('violations.scopeStatRisk')} value={<span className="findings-head__small">{t('map.riskKindSmall')}</span>}
      sub={t('violations.scopeStatRiskSmallHint')} />;
  }
  return (
    <HeadStat label={t('violations.scopeStatRisk')}
      value={<span className={`risk-zone-chip risk-zone-chip--${risk.zone}`}>{t(ZONE_NAME_KEY[risk.zone])}</span>}
      sub={t('violations.scopeStatRiskHint', { density: risk.density.toFixed(DENSITY_DECIMALS) })} />
  );
}

/** Violations and pass rate: the two tiles every header has, each opening its findings when an action is given. */
function CountStats({ m, deltas, actions }) {
  return (
    <>
      <HeadStat label={t('violations.scopeStatViolations')} value={m.violations}
        sub={<SevBadges sevCounts={m.sevCounts} deltas={deltas} onSeverity={actions.onSeverity} />}
        onClick={m.violations ? actions.onViolations : undefined} ariaLabel={t('overview.showAllViolationsAria')} />
      <HeadStat label={t('violations.scopeStatPass')} value={m.passPct == null ? NO_VALUE : `${m.passPct}%`}
        sub={t('violations.scopeStatPassHint', { compliant: m.compliance, checks: m.violations + m.compliance })}
        onClick={m.compliance ? actions.onCompliance : undefined} ariaLabel={t('overview.showComplianceAria')} />
    </>
  );
}

/**
 * The numbers: violations, pass rate, and, over more than one file,
 * violations per 100 files and critical per 1,000 (as Compare reads a
 * project), then, with `showRisk` (a folder or an area), the Risk zone the
 * weighted issues per file put it in (the Map's measure: it compares areas,
 * so a dimension or principle spread over every file read has none worth showing).
 */
function HeadStats({ m, filesHint, oneFile, showRisk, deltas, actions = {} }) {
  const critical = m.sevCounts[SEVERITY.CRITICAL] || 0;
  return (
    <div className="findings-head__stats">
      <CountStats m={m} deltas={deltas} actions={actions} />
      {!oneFile && <HeadStat label={t('violations.scopeStatPer100')} value={fixed1(m.per100)} sub={filesHint} />}
      {!oneFile && <HeadStat label={t('violations.scopeStatCriticalK')} value={fixed1(m.criticalPerK)} alarm={critical > 0}
        sub={t('violations.scopeStatCriticalHint', { count: critical })} />}
      {showRisk && m.risk && <RiskStat risk={m.risk} />}
    </div>
  );
}

/** A graded header's ring: the principle card's own gauge, dashed when the evidence is not enough to grade. */
function GradeRing({ grade }) {
  return (
    <div className="findings-head__ring">
      {grade.insufficient ? <InsufficientGauge /> : <ScoreGauge {...computeGaugeRing(grade.score)} />}
    </div>
  );
}

/**
 * A findings header, one panel: what it is (graded ones, a dimension or a
 * principle, lead with the score ring and read their description under the
 * title; the others keep it behind the title's `?`), then its numbers beside it.
 * @param {object} props
 * @param {string} props.title
 * @param {?string} [props.sub] the line under the title
 * @param {string} [props.description]
 * @param {{score: *, insufficient: boolean, hint: ?string}} [props.grade] a graded scope's score
 * @param {React.ReactNode} [props.badge] beside the title (the score's trend)
 * @param {object} props.metrics scopeMetrics output
 * @param {string} props.filesHint what the per-100 base is ("158 files read")
 * @param {boolean} [props.oneFile] a file scope: no per-100 or critical per 1,000
 * @param {boolean} [props.showRisk] show the Risk zone (folder and area scopes)
 * @param {object} [props.deltas] the severities' change, by severity
 * @param {{onViolations?: Function, onCompliance?: Function, onSeverity?: Function}} [props.actions]
 */
export default function FindingsHead({ title, sub, description, grade, badge, metrics, filesHint, oneFile = false, showRisk = false, deltas, actions }) {
  return (
    <section className="findings-head qd-cards-panel">
      {grade && <GradeRing grade={grade} />}
      <div className="findings-head__who">
        <TermHeader name={title} description={grade ? null : description} sub={sub} badge={badge} />
        {grade && description && <p className="findings-head__desc">{description}</p>}
        {grade?.hint && <p className="findings-head__hint">{grade.hint}</p>}
      </div>
      <HeadStats m={metrics} filesHint={filesHint} oneFile={oneFile} showRisk={showRisk} deltas={deltas} actions={actions} />
    </section>
  );
}
