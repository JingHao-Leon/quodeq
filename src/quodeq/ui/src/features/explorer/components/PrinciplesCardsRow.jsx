import DimensionGaugeCard from '../../dashboard/components/DimensionGaugeCard.jsx';
import { GRADE } from '../../../vocab/grade.js';
import { EVIDENCE_CONFIDENCE } from '../../../vocab/evidenceConfidence.js';

/**
 * Renders one DimensionGaugeCard per principle. Adapts a principleGrade-style
 * record into the `item` shape DimensionGaugeCard expects, and surfaces the
 * "Insufficient" grade as the `isInsufficient` state.
 */
function principleToItem(p) {
  const violationCount = p.violationCount ?? 0;
  const complianceCount = p.complianceCount ?? 0;
  return {
    dimension: p.principle,
    overallScore: p.score ?? null,
    totals: {
      violationCount,
      complianceCount,
      severity: p.severity || {},
    },
  };
}

// Up to this many principles sit on one row; more wrap onto two even rows, so names stay readable.
const ONE_ROW_MAX = 5;
const TWO_ROWS = 2;

/** How many columns `n` cards take on a wide screen: all on one row up to ONE_ROW_MAX, else two even rows. */
export const columnsFor = (n) => (n <= ONE_ROW_MAX ? Math.max(1, n) : Math.ceil(n / TWO_ROWS));

const scoreOf = (p) => { const n = parseFloat(p.score); return Number.isNaN(n) ? Infinity : n; };

/** Weakest first, so the principle to open leads the row; ungraded ones last, ties by name. */
export function weakestFirst(a, b) {
  return (scoreOf(a) - scoreOf(b)) || String(a.principle).localeCompare(String(b.principle));
}

/**
 * The principle cards, compact, weakest first. `highlighted` lights one
 * (hovered or focused here or on the radial); `onHover` reports the one
 * the pointer or keyboard is on, null when it leaves; `deltas` holds each
 * principle's change since the previous period.
 */
export default function PrinciplesCardsRow({ principles = [], onPrincipleClick, highlighted = null, onHover, deltas = null }) {
  return (
    <div
      className="qd-cards-row"
      style={{ '--qd-cards-count': Math.max(1, principles.length), '--qd-cards-cols': columnsFor(principles.length) }}
    >
      {[...principles].sort(weakestFirst).map((p) => {
        const isInsufficient = (p.grade || '').toLowerCase() === GRADE.INSUFFICIENT.toLowerCase();
        const item = principleToItem(p);
        return (
          <DimensionGaugeCard
            key={p.principle}
            delta={deltas?.get(p.principle) ?? null}
            item={item}
            isInsufficient={isInsufficient}
            thinEvidence={p.confidence === EVIDENCE_CONFIDENCE.LOW}
            onDimensionClick={() => onPrincipleClick?.(p.principle)}
            showDate={false}
            compact
            highlighted={highlighted === p.principle}
            onHover={onHover ? (on) => onHover(on ? p.principle : null) : undefined}
          />
        );
      })}
    </div>
  );
}
