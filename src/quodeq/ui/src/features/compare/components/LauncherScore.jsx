import { scoreColorClass } from '../../../utils/formatters.js';
import { score1 } from '../compareFormatters.js';

/** A score shown beside a menu entry, tinted by its grade band. */
export default function LauncherScore({ score }) {
  return (
    <span className={`compare-dueltrigger__itemScore ${scoreColorClass(score)}`}>
      {score1(score)}
    </span>
  );
}
