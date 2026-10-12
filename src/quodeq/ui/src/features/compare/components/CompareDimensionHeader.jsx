import { TermHeader } from '../../../components/terminal/index.js';
import TrendBadge from '../../../components/TrendBadge.jsx';
import { scoreColorClass } from '../../../utils/formatters.js';
import { scoreToGradeLabel } from '../../../utils/gradeThresholds.js';
import { t } from '../../../strings/index.js';
import { nf } from '../compareFormatters.js';
import DimensionTrigger from './DimensionTrigger.jsx';


/** Title/subtitle + the dimension switcher (the same launcher as the fleet's
 * `dimension ▸`, naming and ticking the open one; the breadcrumb walks back). */
export default function CompareDimensionHeader({ view, board, onOpenDimension }) {
  return (
    <div className="term-page-top compare-page__top">
      <div className="compare-page__titles">
        <TermHeader
          name={view.label}
          sub={t('compare.dimSubtitle', {
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
        />
      </div>
      <div className="term-page-top__controls">
        <DimensionTrigger board={board} current={board.find((b) => b.key === view.key) || null} onOpen={onOpenDimension} />
      </div>
    </div>
  );
}
