import PageToolbar from '../../../components/PageToolbar.jsx';
import { t } from '../../../strings/index.js';
import ScopePicker from './ScopePicker.jsx';
import DuelTrigger from './DuelTrigger.jsx';
import DimensionTrigger from './DimensionTrigger.jsx';
import { nf } from '../compareFormatters.js';
import { pluralKey } from '../../../utils/plural.js';


/* The counts line names the never-evaluated projects, so the scope's count
   squares with the ranked table's (which lists only scored projects). */
function countsLine(count, unevaluated, totalFiles) {
  const files = nf(totalFiles);
  if (unevaluated > 0) return t('compare.subtitleUnevaluated', { count, unevaluated, files });
  return t(pluralKey(count, 'compare.subtitleOne', 'compare.subtitle'), { count, files });
}

/** The counts line, and the header controls: duel/dimension launchers and
 * the scope picker. (Ranking lives in the tables' column headers.)
 * `picker` is ScopePicker's props as one object, built by ComparePage. */
export default function CompareFleetHeader({
  picker, totalFiles, scoredRows, unevaluated = 0, openDuelPair, openDuel, board, openDimension,
}) {
  return (
    <PageToolbar title={t('compare.title')} className="compare-page__top" facts={countsLine(picker.scopeCount, unevaluated, totalFiles)}>
      {openDuelPair && scoredRows.length >= 2 && (
        <DuelTrigger targets={scoredRows} onStart={openDuelPair} openDirect={openDuel} />
      )}
      {board.length > 0 && (
        <DimensionTrigger board={board} onOpen={openDimension} />
      )}
      <ScopePicker {...picker} />
    </PageToolbar>
  );
}
