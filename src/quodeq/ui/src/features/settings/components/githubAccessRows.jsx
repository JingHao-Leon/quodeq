import { useState } from 'react';
import { t } from '../../../strings/index.js';

export function SignOutRow({ onSignOut, busy }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <div className="settings-row">
        <button type="button" className="settings-pill settings-pill--accent" onClick={() => setConfirming(true)} disabled={busy}>{t('settings.githubSignOut')}</button>
      </div>
    );
  }
  return (
    <div className="settings-row">
      <span className="settings-row-confirm-label">{t('settings.githubSignOutConfirm')}</span>
      <button type="button" className="settings-pill settings-pill--confirm" onClick={() => { setConfirming(false); onSignOut(); }} disabled={busy}>{t('settings.yes')}</button>
      <button type="button" className="settings-pill" onClick={() => setConfirming(false)} disabled={busy}>{t('settings.no')}</button>
    </div>
  );
}
