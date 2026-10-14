import MoreMenu from '../../../components/launcher/MoreMenu.jsx';
import { t } from '../../../strings/index.js';

/**
 * Restore or delete every dismissed finding of the project (the server's bulk
 * routes are project-wide), behind a quiet ⋯ so a bulk action is never one
 * stray click away. The page's handlers ask for confirmation, so a pick
 * goes straight to them.
 */
export default function DismissedBulk({ count, onRestoreAll, onDeleteAll }) {
  if (count < 2 || (!onRestoreAll && !onDeleteAll)) return null;
  const items = [
    onRestoreAll && { key: 'restore', label: t('violations.wbRestoreAll', { count }), onPick: onRestoreAll },
    onDeleteAll && { key: 'delete', label: t('violations.wbDeleteAll', { count }), onPick: onDeleteAll, danger: true },
  ].filter(Boolean);
  return (
    <div className="wb-actions wb-actions--end">
      <MoreMenu ariaLabel={t('violations.wbDismissedMore')} items={items} />
    </div>
  );
}
