import { TermHeader } from '../../../components/terminal/index.js';
import { t } from '../../../strings/index.js';
import ScopePicker from './ScopePicker.jsx';
import DuelTrigger from './DuelTrigger.jsx';
import DimensionTrigger from './DimensionTrigger.jsx';
import { nf } from '../compareFormatters.js';


/** Title + subtitle, and the header controls: duel/dimension launchers and
 * the scope picker. (Ranking lives in the tables' column headers.)
 * `picker` is ScopePicker's props as one object, built by ComparePage. */
export default function CompareFleetHeader({
  picker, totalFiles, scoredRows, openDuelPair, openDuel, board, openDimension,
}) {
  return (
    <div className="term-page-top compare-page__top">
      <TermHeader
        name={t('compare.title')}
        sub={t('compare.subtitle', { count: picker.scopeCount, files: nf(totalFiles) })}
      />
      <div className="term-page-top__controls">
        {openDuelPair && scoredRows.length >= 2 && (
          <DuelTrigger targets={scoredRows} onStart={openDuelPair} openDirect={openDuel} />
        )}
        {board.length > 0 && (
          <DimensionTrigger board={board} onOpen={openDimension} />
        )}
        <ScopePicker {...picker} />
      </div>
    </div>
  );
}
