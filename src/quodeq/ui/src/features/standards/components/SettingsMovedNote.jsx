import { useState } from 'react';
import { readJSON, writeJSON } from '../../../adapters/storage.js';
import { t } from '../../../strings/index.js';

const DISMISSED_KEY = 'quodeq-settings-moved-dismissed';

function dismissedProjects() {
  const stored = readJSON(DISMISSED_KEY, []);
  return Array.isArray(stored) ? stored : [];
}

/** One-time note after the server moved a repo's standards settings to this machine. */
export function SettingsMovedNote({ projectId, migratedFrom }) {
  const [dismissedIds, setDismissedIds] = useState(dismissedProjects);
  if (!migratedFrom || dismissedIds.includes(projectId)) return null;
  const dismiss = () => {
    const next = [...dismissedProjects(), projectId];
    writeJSON(DISMISSED_KEY, next);
    setDismissedIds(next);
  };
  return (
    <div className="settings-moved-note" role="status">
      <span>{t('standards.settingsMoved', { path: migratedFrom })}</span>
      <button type="button" className="btn-secondary" onClick={dismiss}>{t('standards.settingsMovedDismiss')}</button>
    </div>
  );
}
