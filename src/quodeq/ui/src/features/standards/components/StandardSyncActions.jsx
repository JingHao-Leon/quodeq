import { syncActions } from '../../../models/standardSync.js';
import { t } from '../../../strings/index.js';

const LABEL_KEYS = { share: 'standards.syncShare', publish: 'standards.syncPublish', update: 'standards.syncUpdate', install: 'standards.syncInstall' };

export default function StandardSyncActions({ standard, sync }) {
  const actions = syncActions(standard);
  if (actions.length === 0) return null;
  const pending = sync.pendingId === standard.id;
  return (
    <span className="standards-sync-actions">
      {actions.map(({ action, force }) => (
        <button
          key={action}
          type="button"
          className="standards-sync-btn"
          aria-disabled={pending || undefined}
          onClick={(e) => { e.stopPropagation(); if (!pending) sync.run(standard, { action, force }); }}
        >
          {pending ? t('standards.syncPending') : t(LABEL_KEYS[action])}
        </button>
      ))}
    </span>
  );
}
