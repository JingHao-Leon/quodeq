/**
 * DimensionGaugeCard — large terminal-styled card showing a single dimension's
 * score, grade word, violation/ratio line and severity pills. Shared by the
 * accumulated and run overviews.
 */
import { useId } from 'react';
import TrendBadge from '../../../components/TrendBadge.jsx';
import { SevBadge } from '../../../components/terminal/index.js';
import { SEVERITY_ORDER } from '../../../vocab/severity.js';
import SeverityBadges from '../../../components/SeverityBadges.jsx';
import { scoreChangeShows } from '../../../utils/trendUtils.js';
import { complianceRatio, formatRunId } from '../../../utils/formatters.js';
import { ScoreGauge, InsufficientGauge, computeGaugeRing } from '../../../components/ScoreGauge.jsx';
import { t, LOCALE } from '../../../strings/index.js';
import { computeCoverageInfo, buildPartialTooltip } from './dimensionGaugeMath.js';
import { activateOnKey } from '../../../utils/a11y.js';
import { pluralKey } from '../../../utils/plural.js';

/**
 * Findings the scan produced but scoring never saw, because the principle they
 * named is not in this dimension's standard. Not a findings bucket: they have no
 * principle, so no card and no score. The count sits next to coverage because it
 * answers the same question, how much of the evidence actually reached the grade.
 *
 * Renders nothing at 0, which is every healthy run and every report written
 * before the field existed.
 */
function UnmappedSegment({ count }) {
  if (!count) return null;
  const tooltipKey = pluralKey(count, 'overview.unmappedTooltipOne', 'overview.unmappedTooltipMany');
  return (
    <> · <span
      className="dim-gauge-card__unmapped"
      title={t(tooltipKey, { count: count.toLocaleString(LOCALE) })}
    >{t('overview.unmappedCount', { count: count.toLocaleString(LOCALE) })}</span></>
  );
}

function CoverageLine({ dateText, coveragePct, isPartial, tooltip, quarantinedCount }) {
  if (!dateText) return null;
  return (
    <div className="dim-gauge-card__coverage-line" title={isPartial ? tooltip : undefined}>
      {dateText}
      {coveragePct !== null && (
        <> · <span
          className={`dim-gauge-card__coverage-pct${isPartial ? ' dim-gauge-card__coverage-pct--partial' : ''}`}
        >{coveragePct}%</span></>
      )}
      <UnmappedSegment count={quarantinedCount} />
    </div>
  );
}

const COMPACT_RING_PX = 56;
const PASS_PCT = 100;

/** Compliant checks over all checks, in percent; null with no checks. */
export function passPctOf(item) {
  const v = item.totals?.violationCount ?? 0;
  const c = item.totals?.complianceCount ?? 0;
  return v + c ? Math.round((c / (v + c)) * PASS_PCT) : null;
}

/** The severities present, as the app's pills (count first), wrapping; nothing when there are none. */
function SevPills({ sev }) {
  if (!SEVERITY_ORDER.some((level) => (sev[level] ?? 0) > 0)) return null;
  return <SeverityBadges sev={sev} className="dim-gauge-card__pills" />;
}

/**
 * A compact card (the principle row of a dimension page): the name and its
 * trend (none under 0.05) across the top; below, the ring with the score
 * only, and beside it the grade word at text size in the ring's colour, the
 * severities as the app's pills, and the pass rate.
 */
function CompactCardBody({ name, delta, ring, sev, passPct, summaryId, isInsufficient }) {
  return (
    <>
      <div className="dim-gauge-card__top">
        <span className="dim-gauge-card__name" title={name}>{name}</span>
        {scoreChangeShows(delta) && <TrendBadge delta={delta} />}
      </div>
      <div className="dim-gauge-card__row">
        <div className="dim-gauge-card__mini" style={{ width: COMPACT_RING_PX, height: COMPACT_RING_PX }}>
          {isInsufficient ? <InsufficientGauge /> : <ScoreGauge {...ring} gradeWord={null} />}
        </div>
        <div className="dim-gauge-card__rowbody">
          <span className="dim-gauge-card__gradeword" style={isInsufficient ? undefined : { color: ring.ringColor }}>
            {isInsufficient ? t('overview.insufficientGrade') : ring.gradeWord}
          </span>
          <SevPills sev={sev} />
          {passPct != null && <span className="dim-gauge-card__pass">{t('overview.cardPass', { pct: passPct })}</span>}
        </div>
      </div>
      {!isInsufficient && <span id={summaryId} className="sr-only">{t('overview.gaugeSummaryAria', { score: ring.scoreDisplay, grade: ring.gradeWord })}</span>}
    </>
  );
}

/** The full card's body: the name and trend, then the ring (dashed when not enough evidence), violations and severities. */
function FullCardBody({ item, delta, derived, summaryId, isInsufficient, thinEvidence }) {
  const { scoreDisplay, gradeWord, ringColor, dashOffset, violationCount, ratio, sev } = derived;
  return (
    <>
      <div className="dim-gauge-card__head">
        <span className="dim-gauge-card__name" title={item.dimension}>{item.dimension}</span>
        {delta !== null && delta !== undefined && <TrendBadge delta={delta} />}
      </div>
      {isInsufficient ? <InsufficientGauge /> : (
        <DimensionScoreBody
          scoreDisplay={scoreDisplay} gradeWord={gradeWord} ringColor={ringColor} dashOffset={dashOffset}
          violationCount={violationCount} ratio={ratio} sev={sev}
          summaryId={summaryId} thinEvidence={thinEvidence}
        />
      )}
    </>
  );
}

/** Hover and keyboard focus both tell the page which card is lit (`onHover(true|false)`). */
function hoverHandlers(onHover) {
  if (!onHover) return {};
  return { onMouseEnter: () => onHover(true), onMouseLeave: () => onHover(false), onFocus: () => onHover(true), onBlur: () => onHover(false) };
}

function DimensionScoreBody({ scoreDisplay, gradeWord, ringColor, dashOffset, violationCount, ratio, sev, summaryId, thinEvidence }) {
  return (
    <>
      <ScoreGauge scoreDisplay={scoreDisplay} gradeWord={gradeWord} ringColor={ringColor} dashOffset={dashOffset} />
      <span id={summaryId} className="sr-only">
        {t('overview.gaugeSummaryAria', { score: scoreDisplay, grade: gradeWord })}
        {thinEvidence ? `, ${t('overview.thinEvidence')}` : ''}
      </span>

      <div className="dim-gauge-card__meta">
        {t('overview.violAbbrev')} · {violationCount} · {ratio}
      </div>

      <div className="dim-gauge-card__sev-row">
        {(sev.critical ?? 0) > 0 && <SevBadge level="critical" count={sev.critical} format="count-abbr" />}
        {(sev.major ?? 0)    > 0 && <SevBadge level="major"    count={sev.major}    format="count-abbr" />}
        {(sev.minor ?? 0)    > 0 && <SevBadge level="minor"    count={sev.minor}    format="count-abbr" />}
      </div>
    </>
  );
}

/**
 * @param {object}   props
 * @param {object}   props.item                - dimension entry (dashboard shape)
 * @param {number|string|null} [props.delta]   - trend delta (parent-provided)
 * @param {(item: object) => void} props.onDimensionClick
 * @param {boolean}  [props.evaluatedToday=true] - accumulated overview only: mutes the frame when false
 * @param {string}   [props.dateLabel]         - forwarded to children for run overview
 * @param {string}   [props.selectedRunId]     - forwarded to click handler for run overview
 */
function computeGaugeCardDerived({ item, evaluatedToday, dateLabel, selectedRunId }) {
  const violationCount = item.totals?.violationCount ?? 0;
  const complianceCount = item.totals?.complianceCount ?? 0;
  const coverage = computeCoverageInfo(item.filesRead, item.sourceFileCount, item.exitReason);

  return {
    ...computeGaugeRing(item.overallScore),
    violationCount,
    ratio: complianceRatio(violationCount, complianceCount),
    sev: item.totals?.severity || {},
    staleClass: evaluatedToday ? '' : 'dim-gauge-card--stale',
    dateText: item.fromDateLabel || dateLabel || formatRunId(item.fromRunId || selectedRunId),
    coverage,
    partialTooltip: coverage.isPartial ? buildPartialTooltip(coverage) : undefined,
  };
}

/**
 * @param {object}   props
 * @param {boolean}  [props.isInsufficient=false] - legacy no-evidence state: dashed gauge, wins over thinEvidence
 * @param {boolean}  [props.thinEvidence=false] - scored, but on few observations: adds the thin-evidence line
 *   (also appended to the sr-only summary, the only text assistive tech reads from this button)
 * @param {boolean}  [props.showDate=true] - the date and coverage line under the card
 * @param {boolean}  [props.compact=false] - the row form: ring left, name and one quiet line beside it
 * @param {boolean}  [props.highlighted=false] - lit from elsewhere on the page (its radial point)
 * @param {(on: boolean) => void} [props.onHover] - told when the pointer or keyboard focus enters and leaves
 * See computeGaugeCardDerived above for the remaining props.
 */
export default function DimensionGaugeCard({
  item,
  delta = null,
  onDimensionClick,
  evaluatedToday = true,
  dateLabel,
  selectedRunId,
  isInsufficient = false,
  thinEvidence = false,
  showDate = true,
  compact = false,
  highlighted = false,
  onHover,
}) {
  const derived = computeGaugeCardDerived({ item, evaluatedToday, dateLabel, selectedRunId });
  const { scoreDisplay, gradeWord, ringColor, dashOffset, sev, staleClass, dateText, coverage, partialTooltip } = derived;
  const activate = () => onDimensionClick?.(item, selectedRunId);
  // role="button" gives the article children-presentational semantics, and the
  // explicit aria-label above already skips its content -- so the sr-only score
  // summary needs its own id wired up via aria-describedby to reach assistive
  // tech at all. No description when insufficient:
  // InsufficientGauge's own caption isn't aria-hidden, so it's already exposed.
  const summaryId = useId();

  return (
    <article
      className={['dim-gauge-card', compact && 'dim-gauge-card--compact', highlighted && 'dim-gauge-card--hl', staleClass].filter(Boolean).join(' ')}
      {...hoverHandlers(onHover)}
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={activateOnKey(activate)}
      aria-label={t('overview.dimensionDetailsAria', { name: item.dimension })}
      aria-describedby={isInsufficient ? undefined : summaryId}
    >
      {compact ? (
        <CompactCardBody name={item.dimension} delta={delta} sev={sev} passPct={passPctOf(item)} summaryId={summaryId} isInsufficient={isInsufficient}
          ring={{ scoreDisplay, gradeWord, ringColor, dashOffset }} />
      ) : (
        <FullCardBody item={item} delta={delta} derived={derived} summaryId={summaryId} isInsufficient={isInsufficient} thinEvidence={thinEvidence} />
      )}
      {thinEvidence && !isInsufficient ? <div className="dim-gauge-card__insuf-line">{t('overview.thinEvidence')}</div> : null}

      <CoverageLine
        dateText={showDate ? dateText : null}
        coveragePct={coverage.coveragePct}
        isPartial={coverage.isPartial}
        tooltip={partialTooltip}
        quarantinedCount={item.quarantinedCount}
      />
    </article>
  );
}
