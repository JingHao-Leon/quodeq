import { t } from '../../../strings/index.js';
import MoreMenu from '../../../components/launcher/MoreMenu.jsx';

/** Rare actions live behind a quiet ⋯, so the hero keeps one strong action. */
export default function RunMoreMenu({ onDelete }) {
  return <MoreMenu ariaLabel={t('history.moreActions')} items={[{ key: 'delete', label: t('history.deleteThisRun'), onPick: onDelete, danger: true }]} />;
}
