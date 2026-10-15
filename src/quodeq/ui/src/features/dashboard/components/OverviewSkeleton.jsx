import { TermHeader, SectionLabel } from '../../../components/terminal/index.js';
import { t } from '../../../strings/index.js';
import { formatScoreDisplay, gradeLetter } from '../../../utils/formatters.js';
import { FIX_FIRST_SHOWN } from '../../../components/FixFirstPanel.jsx';
import RunHistoryPanelPlaceholder from './RunHistoryPanelPlaceholder.jsx';
import { COMPACT_MIN_WIDTH, GRID_GAP } from './DimensionCardsGrid.jsx';
import { useBalancedColumns } from '../hooks/useBalancedColumns.js';

// Skeleton frame for the Overview's full footprint, top to bottom as
// AccumulatedOverviewPanel lays it out: the header panel (ring, title and sub
// line, tiles), the since strip, the dimensions as compact cards, the score
// history beside the dimensions radial, then Fix first beside the Where
// panel. Rides the same classes the real FindingsHead / SinceStrip /
// DimensionGaugeCard (compact) / RunHistoryPanel / RadialPanel /
// FixFirstPanel / WherePanel render (dashboard.css, explorer-redesign.css,
// dim-gauge-card.css) so the footprint (panel sizes, grid gaps, columns)
// matches; only the content areas are swapped for static dimmed blocks
// (house idiom: SidePane's body-skeleton spans, SidePane.css -- no shimmer,
// no animation). Shown for the Overview only, in place of the inline
// LoadingScreen, for both windows DashboardPage can be waiting in (before the
// dashboard payload lands, and again if scoring is still catching up after it
// does), so it reads as one continuous skeleton rather than a loader-to-
// skeleton handoff.
//
// The real components render actual numbers and labels as text; this one
// hand-rolls the same class names instead of reusing them so every content
// slot can be a dimmed block rather than real text with nothing to show yet.

// Representative placeholder counts: the real grid's card count varies per
// project (server-filtered by visible standards, see readVisibleStandardIds),
// so there is no fixed list to mirror; eight cards fill two rows of four at
// desktop width, as the common project does. The header's tiles are the
// project's four (violations, pass rate, per 100 files, critical per 1,000);
// Fix first shows its first rows, the Where panel's areas list a handful
// (as tall as the loaded panel beside Fix first).
const DIMENSION_CARD_COUNT = 8;
const HEAD_TILE_COUNT = 4;
const SINCE_NUM_COUNT = 3;
const WHERE_ROW_COUNT = 5;

const placeholders = (count) => Array.from({ length: count }, (_, index) => index);

function hasLastKnown(lastKnown) {
  return Boolean(lastKnown && (lastKnown.grade || lastKnown.score != null));
}

// The header's second line: the project being loaded, and the last known
// grade with the updating mark when the server still has one to show.
function skeletonSub(projectName, lastKnown) {
  if (hasLastKnown(lastKnown)) {
    const values = { score: formatScoreDisplay(lastKnown.score), grade: gradeLetter(lastKnown.grade) };
    return projectName
      ? t('overview.lastKnownUpdatingProject', { name: projectName, ...values })
      : t('overview.lastKnownUpdating', values);
  }
  return projectName ? t('overview.loadingProject', { name: projectName }) : t('overview.loading');
}

/** One dimmed block; `kind` sizes it (dashboard.css .overview-skeleton__bar--*). */
const Bar = ({ kind }) => <span className={`overview-skeleton__bar overview-skeleton__bar--${kind}`} />;

// The ring's place shows the last known score inside and its grade under
// it, dimmed, while the server rebuilds it: a number the user had yesterday
// beats an empty ring.
function SkeletonRing({ lastKnown }) {
  const known = hasLastKnown(lastKnown);
  return (
    <div className="findings-head__ring" aria-hidden="true">
      <span className="overview-skeleton__ring">
        {known && <span className="overview-skeleton__last-known overview-skeleton__ring-score">{formatScoreDisplay(lastKnown.score)}</span>}
      </span>
      {known && lastKnown.grade
        ? <span className="findings-head__gradeword overview-skeleton__last-known">{lastKnown.grade}</span>
        : <Bar kind="gradeword" />}
    </div>
  );
}

function SkeletonTile({ index }) {
  return (
    <div className="findings-head__stat" data-skeleton-index={index}>
      <Bar kind="tile-label" />
      <Bar kind="tile-value" />
      <Bar kind="tile-sub" />
    </div>
  );
}

function SkeletonHead({ projectName, lastKnown }) {
  return (
    <section className="findings-head qd-cards-panel">
      <SkeletonRing lastKnown={lastKnown} />
      <div className="findings-head__who">
        <TermHeader name={t('overview.termName')} sub={skeletonSub(projectName, lastKnown)} />
      </div>
      <div className="findings-head__stats" aria-hidden="true">
        {placeholders(HEAD_TILE_COUNT).map((index) => <SkeletonTile key={index} index={index} />)}
      </div>
    </section>
  );
}

function SkeletonSince() {
  return (
    <section className="overview-since" aria-hidden="true">
      <Bar kind="since-label" />
      {placeholders(SINCE_NUM_COUNT).map((index) => <Bar key={index} kind="since-num" />)}
      <Bar kind="since-movers" />
    </section>
  );
}

function SkeletonDimensionCard({ index }) {
  return (
    <article className="dim-gauge-card dim-gauge-card--compact" data-skeleton-index={index}>
      <div className="dim-gauge-card__top"><Bar kind="name" /></div>
      <div className="dim-gauge-card__row">
        <Bar kind="mini-ring" />
        <div className="dim-gauge-card__rowbody">
          <Bar kind="card-grade" />
          <Bar kind="card-pills" />
          <Bar kind="card-pass" />
        </div>
      </div>
    </article>
  );
}

/** The compact cards, balanced over their rows as DimensionCardsGrid balances them. */
function SkeletonDimensions() {
  const [gridRef, gridStyle] = useBalancedColumns(DIMENSION_CARD_COUNT, COMPACT_MIN_WIDTH, GRID_GAP);
  return (
    <section className="quality-dimensions" aria-hidden="true">
      <div className="quality-dimensions__head">
        <SectionLabel>{t('overview.qualityDimensionsLabel')}</SectionLabel>
      </div>
      <div className="dimensions-panel">
        <div className="dimensions-grid" ref={gridRef} style={gridStyle}>
          {placeholders(DIMENSION_CARD_COUNT).map((index) => <SkeletonDimensionCard key={index} index={index} />)}
        </div>
      </div>
    </section>
  );
}

function SkeletonTopGrid() {
  return (
    <div className="qd-top-grid overview-top-grid" aria-hidden="true">
      <RunHistoryPanelPlaceholder />
      <div className="qd-top-right">
        <section className="run-history-panel--terminal panel">
          <div className="run-history-panel__header">
            <SectionLabel>{t('overview.dimensionsRadialLabel')}</SectionLabel>
          </div>
          <div className="qd-radial"><Bar kind="radial" /></div>
        </section>
      </div>
    </div>
  );
}

/** A list panel: its head's label, a dimmed block per row, and its foot (the show-more or the link out). */
function SkeletonListPanel({ className, label, rows }) {
  return (
    <section className={`qd-cards-panel ${className}`}>
      <div className="qd-cards-panel__head"><SectionLabel>{label}</SectionLabel></div>
      <div className="overview-skeleton__rows">
        {placeholders(rows).map((index) => <Bar key={index} kind="row" />)}
      </div>
      <div className="panel-foot"><Bar kind="foot" /></div>
    </section>
  );
}

function SkeletonBottom() {
  return (
    <div className="explorer-bottom" aria-hidden="true">
      <SkeletonListPanel className="fix-first-panel" label={t('overview.fixFirstLabel')} rows={FIX_FIRST_SHOWN} />
      <section className="explorer-where">
        <Bar kind="where-switch" />
        <SkeletonListPanel className="risk-areas-panel" label={t('overview.riskAreasLabel')} rows={WHERE_ROW_COUNT} />
      </section>
    </div>
  );
}

/**
 * @param {object} props
 * @param {string} [props.projectName] The project being loaded, carried in
 *   the header sub line so the wait still names what it's waiting on.
 * @param {{grade?: string, score?: number, files?: number}|null} [props.lastKnown]
 *   The grade the server last computed for the project, under the previous
 *   formula or version, shown dimmed in the ring's place while it rebuilds.
 */
export default function OverviewSkeleton({ projectName, lastKnown = null }) {
  return (
    <div className="overview-skeleton" aria-busy="true">
      <SkeletonHead projectName={projectName} lastKnown={lastKnown} />
      <SkeletonSince />
      <SkeletonDimensions />
      <SkeletonTopGrid />
      <SkeletonBottom />
    </div>
  );
}
