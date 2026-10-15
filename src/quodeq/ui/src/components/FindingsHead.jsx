import { useRef } from 'react';
import { TermHeader, SevBadge } from './terminal/index.js';
import { ScoreGauge, InsufficientGauge, computeGaugeRing } from './ScoreGauge.jsx';
import { SEVERITY, SEVERITY_ORDER } from '../vocab/severity.js';
import { RISK_ZONE } from '../vocab/riskZone.js';
import { RISK_SMALL } from '../models/findingMetrics.js';
import { t } from '../strings/index.js';
import { useScrolledPast } from '../hooks/useScrolledPast.js';
import { useRowStarts } from '../hooks/useRowStarts.js';
import { TileChange, Description, PastRunNote, SlimBar } from './findingsHeadParts.jsx';
import ScoreSparkline from './ScoreSparkline.jsx';

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
function HeadStat({ label, value, sub, alarm = false, onClick, ariaLabel, change = null }) {
  const top = (
    <>
      <span className="findings-head__label">{label}</span>
      <span className={`findings-head__value${alarm ? ' findings-head__value--alarm' : ''}`}>{value}{change}</span>
    </>
  );
  const under = <span className="findings-head__sub">{sub}</span>;
  if (!onClick) return <div className="findings-head__stat">{top}{under}</div>;
  return (
    <div className="findings-head__stat findings-head__stat--link">
      <button type="button" className="findings-head__hit" onClick={onClick} aria-label={ariaLabel ? t('violations.headStatAria', { label, action: ariaLabel }) : undefined}>{top}</button>
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

/**
 * The Risk tile of a principle: how many of the Map's areas, measured over
 * its findings, are in fix first and watch ("none" when neither), opening
 * the Map's Risk tab on the principle.
 */
function RiskAreasStat({ riskAreas }) {
  const { fixFirst, watch, onOpen, today = false } = riskAreas;
  const value = fixFirst || watch ? t('violations.scopeStatRiskAreasValue', { fixFirst, watch }) : t('violations.scopeStatRiskAreasNone');
  return (
    <HeadStat label={t('violations.scopeStatRisk')} value={<span className="findings-head__areas">{value}</span>}
      sub={t(today ? 'violations.scopeStatRiskAreasToday' : 'violations.scopeStatRiskAreasHint')} onClick={onOpen} ariaLabel={t('violations.scopeStatRiskAreasAria')} />
  );
}

/** Violations and pass rate: the two tiles every header has, each opening its findings when an action is given. */
function CountStats({ m, deltas, changes, actions }) {
  return (
    <>
      <HeadStat label={t('violations.scopeStatViolations')} value={m.violations}
        sub={<SevBadges sevCounts={m.sevCounts} deltas={deltas} onSeverity={actions.onSeverity} />}
        onClick={m.violations ? actions.onViolations : undefined} ariaLabel={t('overview.showAllViolationsAria')} />
      <HeadStat label={t('violations.scopeStatPass')} value={m.passPct == null ? NO_VALUE : `${m.passPct}%`}
        sub={t('violations.scopeStatPassHint', { compliant: m.compliance, checks: m.violations + m.compliance })}
        onClick={m.compliance ? actions.onCompliance : undefined} ariaLabel={t('overview.showComplianceAria')}
        change={<TileChange delta={changes.passPct} points />} />
    </>
  );
}

/** Per 100 files and critical per 1,000, with their changes (lower is better for both). */
function RateStats({ m, filesHint, changes }) {
  const critical = m.sevCounts[SEVERITY.CRITICAL] || 0;
  return (
    <>
      <HeadStat label={t('violations.scopeStatPer100')} value={fixed1(m.per100)} sub={filesHint}
        change={<TileChange delta={changes.per100} invert />} />
      <HeadStat label={t('violations.scopeStatCriticalK')} value={fixed1(m.criticalPerK)} alarm={critical > 0}
        sub={t('violations.scopeStatCriticalHint', { count: critical })} change={<TileChange delta={changes.criticalPerK} invert />} />
    </>
  );
}

/** A principle's requirements: how many fail of how many were checked. */
function RequirementsStat({ requirements }) {
  return <HeadStat label={t('violations.scopeStatReqs')} sub={t('violations.scopeStatReqsHint')}
    value={t('violations.scopeStatReqsValue', { failing: requirements.failing, total: requirements.total })} />;
}

/**
 * The numbers: violations, pass rate, and, over more than one file,
 * violations per 100 files and critical per 1,000 (as Compare reads a
 * project), or, for a principle, its requirements failing; then, with
 * `showRisk` (a folder or an area), the Risk zone the weighted issues per
 * file put it in (the Map's measure: it compares areas, so a dimension or
 * principle spread over every file read has none worth showing), or, with
 * `riskAreas` (a principle), how many areas its findings put in each zone.
 */
function HeadStats({ m, filesHint, oneFile, showRisk, requirements, riskAreas, deltas, changes = {}, actions = {} }) {
  return (
    <div className="findings-head__stats">
      <CountStats m={m} deltas={deltas} changes={changes} actions={actions} />
      {requirements && <RequirementsStat requirements={requirements} />}
      {riskAreas && <RiskAreasStat riskAreas={riskAreas} />}
      {!oneFile && !requirements && <RateStats m={m} filesHint={filesHint} changes={changes} />}
      {showRisk && m.risk && <RiskStat risk={m.risk} />}
    </div>
  );
}

/**
 * A graded header's ring: the principle card's own gauge with the score
 * inside, dashed when the evidence is not enough to grade; the grade word
 * (or that there is not enough evidence) under it at text size, in the ring's colour.
 */
function GradeRing({ grade }) {
  const ring = grade.insufficient ? null : computeGaugeRing(grade.score);
  return (
    <div className="findings-head__ring">
      {ring ? <ScoreGauge {...ring} gradeWord={null} /> : <InsufficientGauge />}
      <span className="findings-head__gradeword" style={ring ? { color: ring.ringColor } : undefined}>
        {ring ? ring.gradeWord : t('overview.insufficientGrade')}
      </span>
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
 * @param {?{failing: number, total: number}} [props.requirements] a principle's requirements, in place of the per-file tiles
 * @param {?{fixFirst: number, watch: number, onOpen?: Function}} [props.riskAreas] a principle's areas in the Map's fix first and watch zones
 * @param {object} [props.deltas] the severities' change, by severity
 * @param {{passPct?: ?number, per100?: ?number, criticalPerK?: ?number}} [props.changes] the tiles' change since the previous period (tileChanges)
 * @param {?{when: string, onBack: Function}} [props.pastRun] a past run on show, and the way back to the latest
 * @param {{onViolations?: Function, onCompliance?: Function, onSeverity?: Function}} [props.actions]
 * @param {?{points: {score: number, dateLabel?: string}[], label: string}} [props.history] the score per period, oldest first (a principle's)
 */
export default function FindingsHead({
  title, sub, description, grade, badge, metrics, filesHint, oneFile = false, showRisk = false, requirements = null, riskAreas = null, deltas, changes,
  pastRun = null, actions, history = null,
}) {
  const headRef = useRef(null);
  const scrolledPast = useScrolledPast(headRef);
  useRowStarts(headRef, '.findings-head__stats');
  return (
    <>
      <SlimBar title={title} grade={grade} metrics={metrics} shown={scrolledPast} />
      <section ref={headRef} className="findings-head qd-cards-panel">
        {grade && <GradeRing grade={grade} />}
        <div className="findings-head__who">
          <TermHeader name={title} description={grade ? null : description} sub={sub} badge={badge} />
          {pastRun && <PastRunNote pastRun={pastRun} />}
          {grade && description && <Description text={description} />}
          {grade?.hint && <p className="findings-head__hint">{grade.hint}</p>}
          {history && <ScoreSparkline points={history.points} label={history.label} />}
        </div>
        <HeadStats m={metrics} filesHint={filesHint} oneFile={oneFile} showRisk={showRisk} requirements={requirements} riskAreas={riskAreas}
          deltas={deltas} changes={changes} actions={actions} />
      </section>
    </>
  );
}
