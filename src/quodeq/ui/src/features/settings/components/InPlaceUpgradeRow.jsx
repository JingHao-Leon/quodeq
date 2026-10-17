import { t } from '../../../strings/index.js';
import { SettingsRowLabel } from './settingsRowParts.jsx';

function rowDescription(status, upgrade) {
  if (upgrade.restarting) return t('updates.relaunching');
  if (upgrade.upgrading) return t('updates.upgrading', { version: upgrade.version });
  if (upgrade.installed) return t('updates.installed', { version: upgrade.version });
  if (upgrade.failed) return [t('updates.upgradeFailed'), upgrade.error].filter(Boolean).join(' ');
  if (upgrade.blocked) return t('updates.installBlocked');
  return status.action_command;
}

function RowAction({ upgrade }) {
  if (upgrade.installed || upgrade.restarting) {
    return (
      <button type="button" className="settings-pill" onClick={upgrade.restart} disabled={upgrade.restarting}>
        {t('updates.restartNow')}
      </button>
    );
  }
  return (
    <button type="button" className="settings-pill" onClick={upgrade.begin} disabled={upgrade.upgrading || upgrade.blocked}>
      {upgrade.failed ? t('updates.tryAgain') : t('updates.install')}
    </button>
  );
}

/**
 * The "Get the update" row for a pip-style install the app can upgrade:
 * Install, progress, then Restart now. A failed upgrade shows the tool's
 * output under a fold and the command to run by hand.
 */
export default function InPlaceUpgradeRow({ status, upgrade }) {
  return (
    <div className="settings-row">
      <SettingsRowLabel hintSlot={false} label={t('settings.getTheUpdate')} description={rowDescription(status, upgrade)} />
      <RowAction upgrade={upgrade} />
      {upgrade.failed && upgrade.output ? (
        <details className="settings-advanced update-output">
          <summary className="settings-advanced-toggle">{t('updates.output')}</summary>
          <pre>{upgrade.output}</pre>
          {status.action_command ? <p>{t('updates.runPrefix')} <code>{status.action_command}</code></p> : null}
        </details>
      ) : null}
    </div>
  );
}
