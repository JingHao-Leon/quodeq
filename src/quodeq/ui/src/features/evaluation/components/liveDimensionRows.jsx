import { useLiveDimensionResults } from '../hooks/useLiveDimensionResults.js';
import { DIM_STATE } from '../../../vocab/dimState.js';
import { sameDim } from './liveViolationsOrdering.js';
import { t } from '../../../strings/index.js';
import { gradeLabel, scoreColorClass } from '../../../utils/formatters.js';

// A finished dimension's grade and score, then its results link. The link is
// a sibling of the accordion button (never nested), and only when the run's
// id is known: before that there is no page to open.
export function DimensionResult({ result }) {
  if (!result) return null;
  return (
    <span className="vlive-dimension-result">
      <span className={`chip small ${scoreColorClass(result.score)}`}>{gradeLabel(result.grade) || '—'}</span>
      <span className={`vlive-dimension-score ${scoreColorClass(result.score)}`}>{result.score.toFixed(1)}</span>
    </span>
  );
}

export function ResultsLink({ dim, onOpen }) {
  if (!onOpen) return null;
  return (
    <button type="button" className="vlive-dimension-open" onClick={onOpen} aria-label={t('evaluate.dimResultsAria', { dim })}>
      {t('evaluate.dimResults')}
    </button>
  );
}

// A finished dimension with no new findings: nothing to expand, but its
// grade, score and results still belong in the list.
export function DoneDimensionRow({ dim, result, onOpenResults }) {
  return (
    <div className="vlive-dimension-group vlive-dimension-group--collapsed">
      <div className="vlive-dimension-row">
        <div className="vlive-dimension-label vlive-dimension-label--static">
          <span className="vlive-dimension-name">{dim.id}</span>
          <DimensionResult result={result} />
          <span className="vlive-dimension-status">{t('evaluate.noNewFindings')}</span>
        </div>
        <ResultsLink dim={dim.id} onOpen={onOpenResults} />
      </div>
    </div>
  );
}

// Finished dimensions' results, the links that open them, and the finished
// dimensions that have no findings row of their own. A diff review gets no
// links and no extra rows: its run folder goes with the job.
export function useFinishedDimensions({ job, progress, orderedDims, review, onOpenDimension }) {
  const resultOf = useLiveDimensionResults(job?.jobId);
  const canOpen = onOpenDimension && job?.outputRunId && review.passed == null;
  const openResults = (dim) => (canOpen
    ? () => onOpenDimension({ dimension: dim, runId: job.outputRunId, fromProject: job.outputProject })
    : null);
  const doneWithout = review.passed != null ? [] : (progress?.dimensions || []).filter(
    (d) => d.state === DIM_STATE.DONE && resultOf(d.id) && !orderedDims.some((o) => sameDim(o.dim, d.id)),
  );
  return { resultOf, openResults, doneWithout };
}
