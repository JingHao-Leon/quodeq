import { t } from '../../strings/index.js';

function rescoreMessage(progress) {
  if (!progress) return null;
  // total stays 0 until the pass has listed its runs; "0 of 0" reads as done.
  if (progress.total === 0) return t('gradeFormula.rescoringStarting');
  return t('gradeFormula.rescoring', { done: progress.done, total: progress.total });
}

// Pre-mounted live region: screen readers announce text changes inside a
// region that already exists, not one that mounts with its first message.
function RescoreStatus({ progress }) {
  return (
    <span className="gf-dirty-hint" role="status">
      {rescoreMessage(progress)}
    </span>
  );
}

/**
 * The line under the editor: the background rescore's progress, the last
 * error, a partial-apply notice, and the thin-evidence note.
 */
export default function FormulaStatus({ error, partialNotice, rescoreProgress }) {
  return (
    <>
      <div className="gf-status">
        <RescoreStatus progress={rescoreProgress} />
        {error ? <span className="gf-dirty-hint">{error}</span> : null}
        {partialNotice ? <span className="gf-dirty-hint" role="alert">{partialNotice}</span> : null}
      </div>
      <p className="settings-description" style={{ marginTop: 8 }}>
        {t('gradeFormula.insufficientNote')}
      </p>
    </>
  );
}
