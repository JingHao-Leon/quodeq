import { t } from '../../../strings/index.js';

/**
 * Restore or delete every dismissed finding of the project (the server's bulk
 * routes are project-wide). The page's handlers ask for confirmation, so a
 * click goes straight to them.
 */
export default function DismissedBulk({ count, onRestoreAll, onDeleteAll }) {
  if (count < 2 || (!onRestoreAll && !onDeleteAll)) return null;
  return (
    <div className="wb-actions">
      {onRestoreAll && <button type="button" className="eval-pill-btn" onClick={onRestoreAll}>{t('violations.wbRestoreAll', { count })}</button>}
      {onDeleteAll && <button type="button" className="eval-pill-btn" onClick={onDeleteAll}>{t('violations.wbDeleteAll', { count })}</button>}
    </div>
  );
}
