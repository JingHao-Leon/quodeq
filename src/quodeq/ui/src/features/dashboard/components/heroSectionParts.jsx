/**
 * What the Overview's and the run page's headers share with History's run
 * panel: the tiles' navigation handlers, and the grade as a chip.
 */
import { scoreColorClass } from '../../../utils/formatters.js';
import { scoreToGradeLabel } from '../../../utils/gradeThresholds.js';
import { HERO_CARD_KIND } from '../dashboardVocab.js';

/**
 * The card-navigation handlers a hero strip wires up. A handler is left
 * undefined where there is nothing to navigate to, which is what makes that
 * card unclickable.
 *
 * @param {((target: string) => void)|undefined} onCardNavigate
 * @param {{violations: number, compliance: number}} counts
 * @returns {{handleViolations: Function|undefined, handleCompliance: Function|undefined, handleSeverity: Function|undefined}}
 */
export function heroCardHandlers(onCardNavigate, { violations, compliance }) {
  return {
    handleViolations: onCardNavigate && violations > 0 ? () => onCardNavigate(HERO_CARD_KIND.VIOLATIONS) : undefined,
    handleCompliance: onCardNavigate && compliance > 0 ? () => onCardNavigate(HERO_CARD_KIND.COMPLIANCE) : undefined,
    handleSeverity: onCardNavigate ? (level) => onCardNavigate(level) : undefined,
  };
}

/**
 * The grade as a chip next to the score value (EXEMPLARY, GOOD, ...), coloured
 * like the score, so the grade is read at a glance rather than in a hint.
 * @param {{grade: string|null|undefined, score: number|string|null}} props
 */
export function GradeChip({ grade, score }) {
  // The word follows the score on show, so the chip can never say a
  // different grade than the number and colour next to it.
  const label = scoreToGradeLabel(score) || grade;
  if (!label) return null;
  return <span className={`chip small ${scoreColorClass(parseFloat(score))}`}>{String(label).toUpperCase()}</span>;
}
