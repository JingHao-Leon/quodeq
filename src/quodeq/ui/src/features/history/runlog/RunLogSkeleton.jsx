const LIST_ROWS = 8;

/**
 * Footprint stand-in for the run log while its data loads: the strip, then
 * the runs list beside the run panel. House skeleton idiom: static dimmed
 * blocks, no shimmer, no spinner.
 */
export default function RunLogSkeleton() {
  return (
    <div className="history-skeleton" aria-busy="true" aria-hidden="true">
      <span className="history-skeleton__block history-skeleton__strip" />
      <div className="history-skeleton__split">
        <div className="history-skeleton__list">
          {Array.from({ length: LIST_ROWS }, (_, i) => <span key={i} className="history-skeleton__row" />)}
        </div>
        <span className="history-skeleton__block history-skeleton__panel" />
      </div>
    </div>
  );
}
