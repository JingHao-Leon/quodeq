/**
 * NotEvaluatedAction: the standards switched on in Standards that have no
 * evaluation yet, as a count in the quality dimensions header beside the
 * label (they used to be one empty card each, then a line under the cards;
 * both took room from the real scores). The names are in its tooltip; it
 * opens Evaluate.
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

export default function NotEvaluatedAction({ ids, onEvaluate }) {
  if (!ids || ids.length === 0) return null;
  const names = namesLine(ids);
  return (
    <button type="button" className="not-evaluated-action" onClick={onEvaluate}
      title={t('overview.notEvaluatedTitle', { names })} aria-label={t('overview.notEvaluatedAria', { names })}>
      <span className="not-evaluated-action__count">{t('overview.notEvaluatedCount', { count: ids.length })}</span>
      {' · '}{t('overview.notEvaluatedEvaluate')}
    </button>
  );
}
