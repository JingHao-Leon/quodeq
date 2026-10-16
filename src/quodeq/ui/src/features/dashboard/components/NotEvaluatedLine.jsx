/**
 * NotEvaluatedLine: the standards switched on in Standards that have no
 * evaluation yet, as one quiet line under the Overview's cards (they used to
 * be one empty card each, which crowded the real scores). Its button opens
 * Evaluate.
 */
import { t } from '../../../strings/index.js';

// Names shown before the rest collapse into "and N more".
const SHOWN = 3;
const ID_SEPARATOR = /-/g;

function namesLine(ids) {
  const names = ids.slice(0, SHOWN).map((id) => id.replace(ID_SEPARATOR, ' ')).join(', ');
  const rest = ids.length - SHOWN;
  return rest > 0 ? t('overview.notEvaluatedMore', { names, count: rest }) : names;
}

export default function NotEvaluatedLine({ ids, onEvaluate }) {
  if (!ids || ids.length === 0) return null;
  return (
    <p className="not-evaluated-line" role="note">
      <span className="not-evaluated-line__label">{t('overview.notEvaluatedLabel')}</span>
      <span className="not-evaluated-line__names">{namesLine(ids)}</span>
      <button type="button" className="term-btn not-evaluated-line__btn" onClick={onEvaluate}>
        {t('overview.notEvaluatedEvaluate')}
      </button>
    </p>
  );
}
