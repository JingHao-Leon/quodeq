import { useRef } from 'react';
import TrendBadge from './TrendBadge.jsx';
import { GRANULARITY } from '../utils/granularity.js';
import { t } from '../strings/index.js';
import { useRowStarts } from '../hooks/useRowStarts.js';

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

/** New and fixed findings, then the rule types that appeared and went away. */
function SinceCounts({ summary }) {
  return (
    <>
      <FindingCounts summary={summary} />
      {summary.typesOpened > 0 && <span className="overview-since__num">{t('overview.sinceTypesOpened', { count: summary.typesOpened })}</span>}
      {summary.typesClosed > 0 && <span className="overview-since__num">{t('overview.sinceTypesClosed', { count: summary.typesClosed })}</span>}
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
 * "Since the previous day / week / month" (the chart's grouping), or the
 * caller's `label` ("since the previous run"), in one line: new and fixed
 * findings, the rule types that appeared or went away, and, on the
 * Overview and the run page, the dimensions that moved most. Without a
 * summary (sinceSummary), the `emptyNote` saying why, or nothing.
 * @param {{summary: ?object, granularity?: string, label?: string, emptyNote?: ?string,
 *   movers?: {name: string, delta: number}[], onMover?: (name: string) => void}} props
 */
export default function SinceStrip({ summary, granularity = GRANULARITY.DAY, label = null, emptyNote = null, movers = [], onMover }) {
  if (!summary && !emptyNote) return null;
  return <SinceStripBody summary={summary} label={label || t(`overview.sincePeriod_${granularity}`)} emptyNote={emptyNote} movers={movers} onMover={onMover} />;
}

// Mounted only with something to say, so the row marks start with the strip itself.
function SinceStripBody({ summary, label, emptyNote, movers, onMover }) {
  const stripRef = useRef(null);
  useRowStarts(stripRef);
  return (
    <section ref={stripRef} className="overview-since" aria-label={label}>
      <span className="overview-since__label">{label}</span>
      {summary ? <SinceCounts summary={summary} /> : <span className="overview-since__num overview-since__num--quiet">{emptyNote}</span>}
      {summary && <Movers movers={movers} onMover={onMover} />}
    </section>
  );
}
