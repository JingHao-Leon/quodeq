import { TermHeader, SevBadge } from '../../../components/terminal/index.js';
import { ScoreGauge, InsufficientGauge, computeGaugeRing } from '../../dashboard/components/DimensionGaugeCard.jsx';
import { SEVERITY_ORDER } from '../../../vocab/severity.js';
import { t } from '../../../strings/index.js';
import { RISK_SMALL } from './scopeMetrics.js';

const fixed1 = (n) => (n == null ? '-' : n.toFixed(1));

const zoneName = (zone) => t(`map.riskZoneName${zone.charAt(0).toUpperCase()}${zone.slice(1)}`);

/** One number of the header: a small label, the value, a muted line under it; a button when it opens something. */
function HeadStat({ label, value, sub, alarm = false, onClick, ariaLabel }) {
  const body = (
    <>
      <span className="findings-head__label">{label}</span>
      <span className={`findings-head__value${alarm ? ' findings-head__value--alarm' : ''}`}>{value}</span>
      <span className="findings-head__sub">{sub}</span>
    </>
  );
  if (!onClick) return <div className="findings-head__stat">{body}</div>;
  return <button type="button" className="findings-head__stat findings-head__stat--link" onClick={onClick} aria-label={ariaLabel}>{body}</button>;
}

/** The violations' severities as the app's badges, most severe first, with their change when there is one. */
function SevBadges({ sevCounts, deltas, onSeverity }) {
  return SEVERITY_ORDER.filter((sev) => sevCounts[sev] || deltas?.[sev]).map((sev) => (
    <SevBadge key={sev} level={sev} count={sevCounts[sev] || 0} delta={deltas?.[sev]} format="count-abbr"
      onClick={onSeverity ? (e) => { e.stopPropagation(); onSeverity(sev); } : undefined} />
  ));
}

/**
 * The numbers: violations, pass rate, and, over more than one file,
 * violations per 100 files and critical per 1,000 (as Compare reads a
 * project), then, for a folder or an area, the Risk zone the weighted issues
 * per file put it in (the Map's measure: it compares areas, so a dimension
 * or principle spread over every file read has none worth showing).
 */
function HeadStats({ m, filesHint, oneFile, showRisk, deltas, actions = {} }) {
  const critical = m.sevCounts.critical || 0;
  return (
    <div className="findings-head__stats">
      <HeadStat label={t('violations.scopeStatViolations')} value={m.violations}
        sub={<SevBadges sevCounts={m.sevCounts} deltas={deltas} onSeverity={actions.onSeverity} />}
        onClick={m.violations ? actions.onViolations : undefined} ariaLabel={t('overview.showAllViolationsAria')} />
      <HeadStat label={t('violations.scopeStatPass')} value={m.passPct == null ? '-' : `${m.passPct}%`}
        sub={t('violations.scopeStatPassHint', { compliant: m.compliance, checks: m.violations + m.compliance })}
        onClick={m.compliance ? actions.onCompliance : undefined} ariaLabel={t('overview.showComplianceAria')} />
      {!oneFile && <HeadStat label={t('violations.scopeStatPer100')} value={fixed1(m.per100)} sub={filesHint} />}
      {!oneFile && <HeadStat label={t('violations.scopeStatCriticalK')} value={fixed1(m.criticalPerK)} alarm={critical > 0}
        sub={t('violations.scopeStatCriticalHint', { count: critical })} />}
      {showRisk && (m.zone === RISK_SMALL
        ? <HeadStat label={t('violations.scopeStatRisk')} value={<span className="findings-head__small">{t('map.riskKindSmall')}</span>} sub={t('violations.scopeStatRiskSmallHint')} />
        : <HeadStat label={t('violations.scopeStatRisk')}
          value={<span className={`risk-zone-chip risk-zone-chip--${m.zone}`}>{zoneName(m.zone)}</span>}
          sub={t('violations.scopeStatRiskHint', { density: m.density.toFixed(2) })} />)}
    </div>
  );
}

/** A graded header's ring: the principle card's own gauge, dashed when the evidence is not enough to grade. */
function GradeRing({ grade }) {
  if (grade.insufficient) return <div className="findings-head__ring"><InsufficientGauge /></div>;
  return <div className="findings-head__ring"><ScoreGauge {...computeGaugeRing(grade.score)} /></div>;
}

/**
 * A findings header, one panel: what it is (graded ones, a dimension or a
 * principle, lead with the score ring and read their description under the
 * title), then its numbers beside it.
 * @param {object} props
 * @param {object} props.metrics scopeMetrics output
 * @param {string} props.filesHint what the per-100 base is ("158 files read")
 * @param {{score: *, insufficient: boolean, hint: ?string}} [props.grade]
 * @param {React.ReactNode} [props.badge] beside the title (the score's trend)
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
        {grade && description && (
          <p className="findings-head__desc">{description}</p>
        )}
        {grade?.hint && <p className="findings-head__hint">{grade.hint}</p>}
      </div>
      <HeadStats m={metrics} filesHint={filesHint} oneFile={oneFile} showRisk={showRisk} deltas={deltas} actions={actions} />
    </section>
  );
}
