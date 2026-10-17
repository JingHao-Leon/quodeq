import { useState } from 'react';
import { GRANULARITY } from '../utils/granularity.js';
import { t } from '../strings/index.js';
import { renderRich } from '../strings/rich.jsx';
import { TIP_KEYS } from './LoadingScreen.jsx';

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

/**
 * "Since the previous day / week / month" (the chart's grouping), or the
 * caller's `label` ("since the previous run"), in one line: new and fixed
 * findings and the rule types that appeared or went away. It sits in the
 * page's header (FindingsHead's `since`), under the title's sub line.
 * Without a summary (sinceSummary), the `emptyNote` saying why, or a tip.
 * @param {{summary: ?object, granularity?: string, label?: string, emptyNote?: ?string}} props
 */
/**
 * One of the loading screen's tips, in the since row's small type on one line,
 * picked once per mount. It fades in after a beat, so a summary that arrives
 * a moment later replaces it before it shows.
 */
function SinceTip() {
  const [key] = useState(() => TIP_KEYS[Math.floor(Math.random() * TIP_KEYS.length)]);
  return (
    <section className="overview-since overview-since--tip" aria-label={t('overview.sinceTipLabel')}>
      <span className="overview-since__tip">{renderRich(t(key))}</span>
    </section>
  );
}

export default function SinceStrip({ summary, granularity = GRANULARITY.DAY, label = null, emptyNote = null }) {
  // The row always holds its line, so the header below never jumps.
  if (!summary && !emptyNote) return <SinceTip />;
  const name = label || t(`overview.sincePeriod_${granularity}`);
  return (
    <section className="overview-since" aria-label={name}>
      <span className="overview-since__label">{name}</span>
      {summary ? <SinceCounts summary={summary} /> : <span className="overview-since__num overview-since__num--quiet">{emptyNote}</span>}
    </section>
  );
}
