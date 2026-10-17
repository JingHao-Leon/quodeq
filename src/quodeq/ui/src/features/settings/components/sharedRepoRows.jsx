import { t } from '../../../strings/index.js';
import { SettingsRowLabel } from './settingsRowParts.jsx';

/**
 * The rows SharedRepoSection is built from: the connected URL with its
 * actions, the URL field, the disconnect confirmation and the error line.
 */

export function ErrorRow({ error }) {
  if (!error) return null;
  return (
    <div className="settings-row settings-row--last">
      <p className="inline-error">{error}</p>
    </div>
  );
}

/**
 * The repository URL row. Connected, it shows the URL once with `change`
 * and `disconnect`; while nothing is connected it says so and the field
 * below takes the URL.
 */
export function UrlRow({ isLoading, status, configured, currentUrl, busy, onChange, onDisconnect }) {
  let description = t('settings.notConfigured');
  if (isLoading && !status) description = t('settings.checkingEllipsis');
  else if (configured) description = <code>{currentUrl}</code>;
  return (
    <div className="settings-row">
      <SettingsRowLabel hintSlot={false} label={t('settings.repositoryUrl')} description={description} />
      {configured && (
        <div className="settings-pill-group">
          <button type="button" className="settings-pill" onClick={onChange} disabled={busy} aria-disabled={busy || undefined}>
            {t('settings.sharedChange')}
          </button>
          {onDisconnect && (
            <button type="button" className="settings-pill settings-pill--accent" onClick={onDisconnect} disabled={busy} aria-disabled={busy || undefined}>
              {t('settings.disconnect')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function UrlInputRow({ newUrl, setNewUrl, isSaving, isDisconnecting, handleSave, onCancel }) {
  return (
    <div className="settings-row">
      <input
        type="text"
        className="settings-input"
        placeholder="https://github.com/team/results.git"
        value={newUrl}
        onChange={(e) => setNewUrl(e.target.value)}
        disabled={isSaving || isDisconnecting}
        aria-label={t('settings.sharedRepoUrlAria')}
      />
      <button
        type="button"
        className="settings-pill"
        onClick={handleSave}
        disabled={isSaving || isDisconnecting}
        aria-disabled={isSaving || isDisconnecting || undefined}
      >
        {isSaving ? t('settings.saving') : t('settings.save')}
      </button>
      {onCancel && (
        <button type="button" className="settings-pill" onClick={onCancel} disabled={isSaving}>
          {t('settings.cancel')}
        </button>
      )}
    </div>
  );
}

/**
 * The confirm step disconnect asks for. Disconnect deletes the clone, so it
 * waits while a refresh rewrites it (the server answers 409
 * REFRESH_IN_PROGRESS then).
 */
export function DisconnectConfirmRow({ blocked, isDisconnecting, onConfirm, onCancel }) {
  return (
    <div className="settings-row settings-row--last">
      <span className="settings-row-confirm-label">{t('settings.disconnectConfirm')}</span>
      <button
        type="button"
        className="settings-pill settings-pill--confirm"
        onClick={onConfirm}
        disabled={blocked}
        aria-disabled={blocked || undefined}
      >
        {isDisconnecting ? t('settings.disconnecting') : t('settings.yes')}
      </button>
      <button
        type="button"
        className="settings-pill"
        onClick={onCancel}
        disabled={isDisconnecting}
        aria-disabled={isDisconnecting || undefined}
      >
        {t('settings.no')}
      </button>
    </div>
  );
}
