import { t } from '../../../strings/index.js';
import { confirmDialog } from '../../../utils/confirmDialog.js';
import { DIALOG_VARIANT } from '../../../vocab/dialogVariant.js';

/** Restore or delete every dismissed finding of the project (the server's bulk routes are project-wide). */
export default function DismissedBulk({ count, onRestoreAll, onDeleteAll }) {
  if (count < 2 || (!onRestoreAll && !onDeleteAll)) return null;
  const deleteAll = async () => {
    const ok = await confirmDialog({
      title: t('violations.deleteAllConfirmTitle'), message: t('violations.deleteAllConfirmMessage'), variant: DIALOG_VARIANT.DANGER,
    });
    if (ok) onDeleteAll();
  };
  return (
    <div className="wb-actions">
      {onRestoreAll && <button type="button" className="eval-pill-btn" onClick={onRestoreAll}>{t('violations.wbRestoreAll', { count })}</button>}
      {onDeleteAll && <button type="button" className="eval-pill-btn" onClick={deleteAll}>{t('violations.wbDeleteAll', { count })}</button>}
    </div>
  );
}
