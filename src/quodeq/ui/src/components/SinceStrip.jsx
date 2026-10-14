import TrendBadge from './TrendBadge.jsx';
import { GRANULARITY } from '../utils/granularity.js';
import { t } from '../strings/index.js';

/** New and fixed findings, or, when neither moved, one quiet line saying so. */
function FindingCounts({ summary }) {
  if (!summary.newCount && !summary.resolvedCount) {
    return <span className="overview-since__num overview-since__num--quiet">{t('overview.sinceNone')}</span>;
  }
  return (
    <>
      <span className="overview-since__num overview-since__num--new">{t('overview.sinceNew', { count: summary.newCount })}</span>
      <span className="overview-since__num overview-since__num--fixed">{t('overview.sinceFixed', { count: summary.resolvedCount })}</span>
    </>
  );
}

/** The dimensions that moved most, each opening its page. */
function Movers({ movers, onMover }) {
  if (!movers.length) return null;
  return (
    <span className="overview-since__movers">
      <span className="overview-since__label">{t('overview.sinceMovers')}</span>
      {movers.map((m) => (
        <button key={m.name} type="button" className="overview-since__mover" onClick={onMover ? () => onMover(m.name) : undefined}>
          {m.name} <TrendBadge delta={m.delta} />
        </button>
      ))}
    </span>
  );
}

/**
 * "Since the previous day / week / month" (the chart's grouping) in one
 * line: new and fixed findings, the rule types that appeared or went away,
 * and, on the Overview, the dimensions that moved most. Nothing without a
 * summary (sinceSummary).
 * @param {{summary: ?object, granularity?: string, movers?: {name: string, delta: number}[], onMover?: (name: string) => void}} props
 */
export default function SinceStrip({ summary, granularity = GRANULARITY.DAY, movers = [], onMover }) {
  if (!summary) return null;
  const label = t(`overview.sincePeriod_${granularity}`);
  return (
    <section className="overview-since" aria-label={label}>
      <span className="overview-since__label">{label}</span>
      <FindingCounts summary={summary} />
      {summary.typesOpened > 0 && <span className="overview-since__num">{t('overview.sinceTypesOpened', { count: summary.typesOpened })}</span>}
      {summary.typesClosed > 0 && <span className="overview-since__num">{t('overview.sinceTypesClosed', { count: summary.typesClosed })}</span>}
      <Movers movers={movers} onMover={onMover} />
    </section>
  );
}
