/**
 * The dimension page's sections: its header (with where its standard comes
 * from, the tiles' changes since the previous period and the note on a past
 * run), the principle cards, and the bottom (Fix first beside where the
 * findings are).
 */
import { useState } from 'react';
import OffendingFilesSection from '../../../components/OffendingFilesSection.jsx';
import FixFirstPanel from '../../../components/FixFirstPanel.jsx';
import FindingsByFolderPanel from '../../../components/FindingsByFolderPanel.jsx';
import FindingsHead from '../../../components/FindingsHead.jsx';
import WherePanel, { WHERE } from '../../../components/WherePanel.jsx';
import TrendBadge from '../../../components/TrendBadge.jsx';
import { SectionLabel } from '../../../components/terminal/index.js';
import { scopeMetrics, runDimensionMetrics, tileChanges } from '../../../models/findingMetrics.js';
import { standardOriginParts } from '../../../models/standard.js';
import { GRADE } from '../../../vocab/grade.js';
import { t } from '../../../strings/index.js';
import PrinciplesCardsRow from './PrinciplesCardsRow.jsx';

/**
 * The header's sub line: where the standard comes from (its family and
 * edition, its version, what it is based on), then the run's date.
 */
export function headSub(standardInfo, when) {
  return [...standardOriginParts(standardInfo), when].filter(Boolean).join(t('violations.wbDot')) || null;
}

/**
 * The files per 100 is over: the dimension's own count in its report, else
 * the run on show's (its run scores), else the count the page was handed.
 */
const filesReadOf = (d, borrowed) => d.evalData.filesRead ?? d.runFilesRead ?? borrowed ?? 0;

/**
 * The dimension's header: its score ring and trend, where its standard
 * comes from, its description, and its numbers (violations, pass rate, per
 * 100 files read, critical per 1,000), each with its change since the
 * previous period, the violations and pass rate opening their findings.
 */
export function ExplorerHead({ dim, d, overallScoreNum, standardDescription, standardInfo, activeDateLabel, activeRunId, periodDeltas, actions, filesRead: borrowedFilesRead, previous, pastRun }) {
  const filesRead = filesReadOf(d, borrowedFilesRead);
  const metrics = scopeMetrics({ sevCounts: d.severityCounts || {}, total: d.allViolations.length, compliance: d.totalCompliant, files: filesRead });
  return (
    <FindingsHead
      title={dim} sub={headSub(standardInfo, activeDateLabel || activeRunId)} description={standardDescription}
      grade={{ score: overallScoreNum, insufficient: d.overallGrade?.grade === GRADE.INSUFFICIENT, hint: null }}
      badge={periodDeltas.score !== null ? <TrendBadge delta={periodDeltas.score} /> : null}
      metrics={metrics} filesHint={t('violations.scopeStatFilesRead', { count: filesRead })} deltas={periodDeltas.chips} actions={actions}
      changes={tileChanges(metrics, runDimensionMetrics(previous))} pastRun={pastRun}
    />
  );
}

/** The principle cards, each opening its principle, lit with the radial. */
export function PrinciplesPanel({ radialPrinciples, enrichedPrinciples, onPrincipleClick, lit, deltas }) {
  return (
    <section className="qd-cards-panel explorer-principles" aria-label={t('explorer.principlesAria')}>
      <div className="qd-cards-panel__head">
        <SectionLabel>{t('explorer.principlesLabel')} · {radialPrinciples.length}</SectionLabel>
      </div>
      <PrinciplesCardsRow principles={enrichedPrinciples} onPrincipleClick={onPrincipleClick}
        highlighted={lit.principle} onHover={lit.setPrinciple} deltas={deltas} />
    </section>
  );
}

// The Map's areas wait for Risk by dimension.
const DIMENSION_WHERE_VIEWS = [WHERE.FOLDERS, WHERE.FILES];

/**
 * The page's bottom, what to fix beside where it is: Fix first on the left
 * (a lit principle lights its rows), and on the right the folders or the
 * files this dimension's findings are in (folders first).
 */
export function DimensionFindingsPanels({ d, fixFirstDims, findingsNav, litPrinciple }) {
  const [where, setWhere] = useState(WHERE.FOLDERS);
  return (
    <div className="explorer-bottom">
      <FixFirstPanel dimensions={fixFirstDims} oneDimension litPrinciple={litPrinciple} onRequirementClick={findingsNav.onRequirementClick} />
      <WherePanel view={where} onView={setWhere} views={DIMENSION_WHERE_VIEWS}>
        {where === WHERE.FOLDERS && <FindingsByFolderPanel dimensions={fixFirstDims} onFolderClick={findingsNav.onFolderClick} />}
        {where === WHERE.FILES && <OffendingFilesSection topFiles={d.topFiles} onFileClick={findingsNav.onFileClick} />}
      </WherePanel>
    </div>
  );
}

/**
 * A past run on show (a history bar was clicked, so not the latest): its
 * date, and the way back to the latest. Null on the latest, or when the
 * latest is not known.
 */
export function pastRunNote({ latestRunId, activeRunId, activeDateLabel, trend, setActiveRunId, setActiveDateLabel }) {
  if (!latestRunId || !activeRunId || activeRunId === latestRunId) return null;
  return {
    when: activeDateLabel || activeRunId,
    onBack: () => {
      setActiveRunId(latestRunId);
      setActiveDateLabel((trend || []).find((e) => e.runId === latestRunId)?.dateLabel || null);
    },
  };
}
