import { useState } from 'react';
import SectionLabel from '../../../components/terminal/SectionLabel.jsx';
import { SettingsPillTabs, SettingsRowLabel } from './settingsRowParts.jsx';
import { t } from '../../../strings/index.js';

// PROTOTYPE: sample numbers; the real row reads them from the storage endpoint.
const SAMPLE = { bytes: 6.7e9, runs: 470, projects: 5, archived: 216, preview: { archive: 212, frees: 3.1e9 } };
const ARCHIVE_AFTER = [
  { v: 3, l: t('storage.months', { count: 3 }) }, { v: 6, l: t('storage.months', { count: 6 }) },
  { v: 12, l: t('storage.year') }, { v: 0, l: t('storage.never') },
];
const gb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);

function Menu({ open, onToggle, onDeleteAll }) {
  return (
    <span className="storage-menu">
      <button type="button" className="term-btn storage-menu__btn" aria-label={t('storage.pageMenu')} aria-expanded={open} onClick={onToggle}>⋯</button>
      {open && (
        <span className="storage-menu__pop" role="menu">
          <button type="button" role="menuitem" className="storage-menu__item storage-menu__item--danger" onClick={onDeleteAll}>{t('storage.deleteAll')}</button>
        </span>
      )}
    </span>
  );
}

function Modal({ titleId, title, children, actions, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <h3 id={titleId} className="modal-title">{title}</h3>
        {children}
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>{t('common.cancel')}</button>
          {actions}
        </div>
      </div>
    </div>
  );
}

// Same shape as deleting a standard: what goes in bold, then type the phrase.
function DeleteAll({ data, onCancel }) {
  const [typed, setTyped] = useState('');
  const word = t('storage.deleteAllWord');
  return (
    <Modal titleId="storage-delete-title" title={t('storage.deleteAllTitle')} onCancel={onCancel}
      actions={<button type="button" className="btn-danger" disabled={typed.toLowerCase().trim() !== word} onClick={onCancel}>{t('storage.deleteConfirm')}</button>}>
      <p className="modal-body modal-body--warning">
        {t('storage.deleteAllLead')} <strong>{t('storage.deleteAllWhat', { runs: data.runs, projects: data.projects, size: gb(data.bytes) })}</strong>. {t('storage.deleteAllKept')} {t('standards.cannotBeUndone')}
      </p>
      <p className="modal-body">{t('standards.typePrefix')} <strong>{word}</strong> {t('standards.toConfirmSuffix')}</p>
      <input className="modal-input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={word} aria-label={t('storage.typeToConfirmAria')} autoFocus />
    </Modal>
  );
}

/** Settings › Evaluation › STORAGE: space used with clean now and delete all (behind ⋯), and when old runs are archived. */
export default function StorageSection({ data = SAMPLE }) {
  const [after, setAfter] = useState(6);
  const [menu, setMenu] = useState(false);
  const [preview, setPreview] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <section className="panel settings-section storage-section">
      <div className="panel-header"><SectionLabel marker="▶">{t('storage.sectionLabel')}</SectionLabel></div>
      <div className="settings-row">
        <SettingsRowLabel hintSlot={false} label={t('storage.spaceUsed')}
          description={t('storage.facts', { size: gb(data.bytes), archived: data.archived, runs: data.runs })} />
        <div className="storage-row__controls">
          <button type="button" className="term-btn" onClick={() => setPreview(true)}>{t('storage.cleanNow')}</button>
          <Menu open={menu} onToggle={() => setMenu(!menu)} onDeleteAll={() => { setMenu(false); setDeleting(true); }} />
        </div>
      </div>
      <div className="settings-row settings-row--last">
        <SettingsRowLabel hintSlot={false} label={t('storage.archiveAfter')} description={t('storage.archiveAfterDesc')} />
        <SettingsPillTabs options={ARCHIVE_AFTER} value={after} onChange={setAfter} />
      </div>
      {preview && (
        <Modal titleId="storage-clean-title" title={t('storage.cleanTitle')} onCancel={() => setPreview(false)}
          actions={<button type="button" className="term-btn term-btn--primary" onClick={() => setPreview(false)}>{t('storage.cleanConfirm')}</button>}>
          <p>{t('storage.cleanSummary', { archive: data.preview.archive, frees: gb(data.preview.frees) })}</p>
          <p className="settings-description">{t('storage.cleanNote')}</p>
        </Modal>
      )}
      {deleting && <DeleteAll data={data} onCancel={() => setDeleting(false)} />}
    </section>
  );
}
