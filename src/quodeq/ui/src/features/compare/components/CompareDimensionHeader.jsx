import PageToolbar from '../../../components/PageToolbar.jsx';
import TrendBadge from '../../../components/TrendBadge.jsx';
import { scoreColorClass } from '../../../utils/formatters.js';
import { scoreToGradeLabel } from '../../../utils/gradeThresholds.js';
import { t } from '../../../strings/index.js';
import { nf } from '../compareFormatters.js';
import DimensionTrigger from './DimensionTrigger.jsx';


/** The dimension's grade, trend and counts (the breadcrumb names it) + the dimension switcher (the same launcher as the fleet's
 * `dimension ▸`, naming and ticking the open one; the breadcrumb walks back). */
export default function CompareDimensionHeader({ view, board, onOpenDimension }) {
  return (
    <PageToolbar
      title={view.label}
      className="compare-page__top"
      facts={t('compare.dimSubtitle', {
        principles: view.principles.length,
        violations: nf(view.violations),
        projects: view.standings.length,
      })}
      badge={(
        <span className="compare-dim-badges">
          <span className={`compare-dim-tier ${scoreColorClass(view.avg)}`}>
            {scoreToGradeLabel(view.avg) || ''}
          </span>
          <TrendBadge delta={view.delta} />
        </span>
      )}
    >
      <DimensionTrigger board={board} current={board.find((b) => b.key === view.key) || null} onOpen={onOpenDimension} />
    </PageToolbar>
  );
}
