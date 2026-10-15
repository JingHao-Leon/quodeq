import DimensionGaugeCard from './DimensionGaugeCard.jsx';
import NotEvaluatedGaugeCard from './NotEvaluatedGaugeCard.jsx';
import { fallbackDelta } from '../../../utils/dimensionUtils.js';
import { EVIDENCE_CONFIDENCE } from '../../../vocab/evidenceConfidence.js';
import { useBalancedColumns } from '../hooks/useBalancedColumns.js';

// Narrowest card that still fits a long name ("clean-architecture") on one
// line, and the grid's gap (--space-3).
const CARD_MIN_WIDTH = 180;
// A compact card (ring beside its numbers) needs room for both.
const COMPACT_MIN_WIDTH = 240;
const GRID_GAP = 12;

const NOT_LIT = Object.freeze({ name: null, setName: null });

/**
 * The dimension cards. They keep the incoming order (the Overview hands
 * them weakest first) whatever the selected period: changing the
 * day/week/month re-dims cards but never reorders them. Standards switched
 * on but never evaluated follow as empty cards. Rows are balanced (5 + 4,
 * never 8 + 1) once the grid needs more than one.
 * @param {object} props
 * @param {object[]} props.sortedDimensions
 * @param {(item: object) => void} [props.onDimensionClick]
 * @param {Set<string>} [props.selectedDayDimNames] the dimensions the selected period evaluated (the others dim)
 * @param {object} [props.dimTrends] each dimension's change, by lowercase name
 * @param {string[]} [props.notEvaluated] standards switched on without results
 * @param {() => void} [props.onEvaluate] what an empty card opens
 * @param {boolean} [props.compact] the principle card's form: ring beside grade, pills and pass rate
 * @param {{name: ?string, setName: ?Function}} [props.lit] the card lit with its radial point, and who to tell which card the pointer or keyboard is on
 */
export default function DimensionCardsGrid({
  sortedDimensions, onDimensionClick, selectedDayDimNames, dimTrends, notEvaluated = [], onEvaluate, compact = false, lit = NOT_LIT,
}) {
  const dimNameSet = selectedDayDimNames instanceof Set ? selectedDayDimNames : new Set();
  const [gridRef, gridStyle] = useBalancedColumns(sortedDimensions.length + notEvaluated.length, compact ? COMPACT_MIN_WIDTH : CARD_MIN_WIDTH, GRID_GAP);
  return (
    <div className="dimensions-grid" ref={gridRef} style={gridStyle}>
      {sortedDimensions.map((item) => {
        const isActive = dimNameSet.size === 0 || dimNameSet.has((item.dimension || '').toLowerCase());
        const entry = dimTrends?.[(item.dimension || '').toLowerCase()];
        const delta = entry ? entry.delta : fallbackDelta(item);
        return (
          <DimensionGaugeCard
            key={item.dimension}
            item={item}
            delta={delta}
            onDimensionClick={onDimensionClick}
            evaluatedToday={isActive}
            thinEvidence={item.confidence === EVIDENCE_CONFIDENCE.LOW}
            compact={compact}
            showDate={!compact}
            highlighted={lit.name === item.dimension}
            onHover={lit.setName ? (on) => lit.setName(on ? item.dimension : null) : undefined}
          />
        );
      })}
      {notEvaluated.map((name) => <NotEvaluatedGaugeCard key={name} name={name} onActivate={onEvaluate} compact={compact} />)}
    </div>
  );
}
