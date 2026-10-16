import { relativeTimeFine } from '../../../utils/relativeTime.js';
import { t } from '../../../strings/index.js';

/**
 * The slim band above the Standards table while a shared repository is
 * connected: which repository, when it last synced, and a pull that starts
 * a refresh of the clone (the list re-reads once that job is done).
 */
export default function StandardsSharedBand({ host, lastSynced, refreshing, onPull }) {
  const synced = relativeTimeFine(lastSynced);
  return (
    <div className="standards-band">
      <span>{t('standards.bandRepository')}</span>
      {host && <span className="standards-band__name">{host}</span>}
      {synced && <span>· {t('standards.bandSynced', { time: synced })}</span>}
      <span className="standards-band__spacer" />
      <button
        type="button"
        className="standards-sync-btn"
        aria-disabled={refreshing || undefined}
        onClick={() => { if (!refreshing) onPull(); }}
      >
        {refreshing ? t('standards.bandPulling') : t('standards.bandPull')}
      </button>
    </div>
  );
}
