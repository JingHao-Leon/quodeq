import { useState } from 'react';
import SectionLabel from '../../../components/terminal/SectionLabel.jsx';
import { SettingsPillTabs, SettingsRowLabel } from './settingsRowParts.jsx';
import { CleanModal, DeleteAllModal } from './StorageModals.jsx';
import useStorage, { CLEAN_STATE } from '../hooks/useStorage.js';
import { formatBytes } from '../../../utils/formatSize.js';
import { t } from '../../../strings/index.js';

// How many of a project's newest runs stay in full, as PUT /api/storage/settings takes them; null keeps all.
const KEEP_RUNS = [
  { v: 5, l: t('storage.runs', { count: 5 }) }, { v: 10, l: t('storage.runs', { count: 10 }) },
  { v: 25, l: t('storage.runs', { count: 25 }) }, { v: null, l: t('storage.all') },
];
const AUTO_CLEANUP = [{ v: true, l: t('settings.on') }, { v: false, l: t('settings.off') }];

// The first start under the count rule held the archive back; this says what
// the next start archives, under the settings that change it.
function ArchiveNotice({ data }) {
  const notice = data?.archiveNotice;
  if (!notice) return null;
  const keep = data.keepRuns ?? '';
  return (
    <p className="storage-notice" role="status">
      {t(notice.runs === 1 ? 'storage.archiveNoticeOne' : 'storage.archiveNotice', { runs: notice.runs, keep, size: formatBytes(notice.bytes) })}
    </p>
  );
}

function Menu({ open, disabled, onToggle, onDeleteAll }) {
  return (
    <span className="storage-menu">
      <button type="button" className="term-btn storage-menu__btn" aria-label={t('storage.pageMenu')} aria-expanded={open} disabled={disabled} onClick={onToggle}>⋯</button>
      {open && (
        <span className="storage-menu__pop" role="menu">
          <button type="button" role="menuitem" className="storage-menu__item storage-menu__item--danger" onClick={onDeleteAll}>{t('storage.deleteAll')}</button>
        </span>
      )}
    </span>
  );
}

// The Space used row's line: loading and error keep the row's height, a
// running pass replaces the facts with its progress, and a pass this session
// watched says what it freed, or that it did not finish.
function factsLine({ data, isLoading, isError, clean, running, endedHere }) {
  if (running) return t('storage.cleaning', { done: clean.done, total: clean.total });
  if (isError && !data) return t('storage.factsError');
  if (isLoading || !data) return t('storage.factsLoading');
  const facts = t('storage.facts', { size: formatBytes(data.bytes), archived: data.archived, runs: data.runs });
  if (endedHere === CLEAN_STATE.DONE) return `${facts}. ${t('storage.freed', { size: formatBytes(clean.bytesFreed) })}`;
  if (endedHere === CLEAN_STATE.FAILED) return `${facts}. ${t('storage.cleanDidNotFinish')}`;
  return facts;
}

/**
 * Settings › Evaluation › STORAGE: space used with clean now and delete all
 * (behind ⋯), whether cleanup runs after start, and how many of a project's
 * runs stay in full; above them, the first-start notice while one is pending. `onEvaluationsDeleted` runs
 * after delete all, so the app can leave a project that no longer exists.
 */
export default function StorageSection({ onEvaluationsDeleted = () => {} }) {
  const storage = useStorage();
  const { data, running } = storage;
  const [menu, setMenu] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteAll = async () => {
    await storage.deleteAll();
    onEvaluationsDeleted();
  };
  return (
    <section className="panel settings-section storage-section">
      <div className="panel-header"><SectionLabel marker="▶">{t('storage.sectionLabel')}</SectionLabel></div>
      <ArchiveNotice data={data} />
      <div className="settings-row">
        <SettingsRowLabel hintSlot={false} label={t('storage.spaceUsed')} description={factsLine(storage)} />
        <div className="storage-row__controls">
          <button type="button" className="term-btn" disabled={running} onClick={() => setCleaning(true)}>{t('storage.cleanNow')}</button>
          <Menu open={menu} disabled={!data} onToggle={() => setMenu(!menu)} onDeleteAll={() => { setMenu(false); setDeleting(true); }} />
        </div>
      </div>
      <div className="settings-row">
        <SettingsRowLabel hintSlot={false} label={t('storage.autoCleanup')} description={t('storage.autoCleanupDesc')} />
        <SettingsPillTabs options={AUTO_CLEANUP} value={data ? data.autoCleanup : undefined} onChange={storage.setAutoCleanup} />
      </div>
      <div className="settings-row settings-row--last">
        <SettingsRowLabel hintSlot={false} label={t('storage.keepRuns')} description={t('storage.keepRunsDesc')} />
        <SettingsPillTabs options={KEEP_RUNS} value={data ? data.keepRuns : undefined} onChange={storage.setKeepRuns} />
      </div>
      {storage.saveFailed && <p className="inline-error storage-save-error">{t('storage.saveFailed')}</p>}
      {cleaning && (
        <CleanModal autoArchive={Boolean(data?.autoCleanup && data.keepRuns != null)}
          onClean={storage.runClean} onClose={() => setCleaning(false)} />
      )}
      {deleting && data && <DeleteAllModal data={data} onDelete={deleteAll} onClose={() => setDeleting(false)} />}
    </section>
  );
}
