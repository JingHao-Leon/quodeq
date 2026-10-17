import { t } from '../../strings/index.js';

function Banner({ security, children, actions }) {
  return (
    <div className={`update-banner${security ? ' update-banner--security' : ''}`} role="status">
      <span className="update-banner-text">{children}</span>
      {actions ? <span className="update-banner-actions">{actions}</span> : null}
    </div>
  );
}

function Pill({ onClick, disabled, title, children }) {
  return (
    <button type="button" className="settings-pill" onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

function FailedText({ upgrade, command }) {
  return (
    <>
      {t('updates.upgradeFailed')}
      {upgrade.error ? <> {upgrade.error}</> : null}
      {command ? <> {t('updates.runPrefix')} <code className="update-banner-cmd">{command}</code></> : null}
    </>
  );
}

/**
 * The banner for a pip-style install the app can upgrade itself: Install,
 * live progress, then "Restart now" (the person picks the moment). A failed
 * upgrade keeps the command so it can be run by hand.
 */
export default function InPlaceUpgradeBanner({ status, upgrade, dismissButton }) {
  const version = upgrade.version;
  if (upgrade.restarting) return <Banner>{t('updates.relaunching')}</Banner>;
  if (upgrade.upgrading) return <Banner>{t('updates.upgrading', { version })}</Banner>;
  if (upgrade.installed) {
    return (
      <Banner actions={<Pill onClick={upgrade.restart}>{t('updates.restartNow')}</Pill>}>
        {t('updates.installed', { version })}
      </Banner>
    );
  }
  const install = (
    <>
      <Pill onClick={upgrade.begin} disabled={upgrade.blocked} title={upgrade.blocked ? t('updates.installBlocked') : undefined}>
        {upgrade.failed ? t('updates.tryAgain') : t('updates.install')}
      </Pill>
      {dismissButton}
    </>
  );
  return (
    <Banner security={status.is_security} actions={install}>
      {status.is_security ? <strong>{t('updates.securityPrefix')}</strong> : null}
      {upgrade.failed
        ? <FailedText upgrade={upgrade} command={status.action_command} />
        : t('updates.available', { version: status.latest })}
      {upgrade.blocked && !upgrade.failed ? <> {t('updates.installBlocked')}</> : null}
    </Banner>
  );
}
