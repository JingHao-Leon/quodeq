import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { projectsKeys, storageKeys } from '../../../api/queryKeys.js';
import { HTTP_STATUS } from '../../../constants.js';
import { findProject } from '../../../utils/projectIdentity.js';
import { formatBytes } from '../../../utils/formatSize.js';
import { t } from '../../../strings/index.js';
// The delete-all modal is deliberately the same box as deleting a standard.
import Modal from '../../standards/components/StandardsModal.jsx';

// The 409 code for "the score warm-up is running" (api/routes_storage.py).
const WARMUP_CODE = 'STORAGE_WARMUP';

/** The modal line for a failed clean or delete all; `fallbackKey` for anything that is not a busy 409. */
export function busyMessage(err, { fallbackKey, cleanKey, nameOf }) {
  if (err?.status !== HTTP_STATUS.CONFLICT) return t(fallbackKey);
  const blocking = err.body?.projects ?? [];
  if (blocking.length) return t('storage.busyEvaluation', { names: blocking.map(nameOf).join(', ') });
  if ((err.code ?? err.body?.code) === WARMUP_CODE) return t('storage.busyWarmup');
  return t(cleanKey);
}

function ModalError({ message }) {
  return message ? <p role="alert" className="inline-error">{message}</p> : null;
}

function previewText(preview, isError) {
  if (isError) return t('storage.previewFailed');
  if (!preview) return t('storage.cleanPreviewLoading');
  if (preview.archive === 0) return t('storage.cleanNothing');
  return t('storage.cleanSummary', { archive: preview.archive, frees: formatBytes(preview.frees) });
}

/** "Clean now": what a pass would archive (fetched on open), then start it. */
export function CleanModal({ onClean, onClose }) {
  const { getCleanPreview } = useApi();
  const preview = useQuery({ queryKey: storageKeys.preview(), queryFn: getCleanPreview, staleTime: 0, gcTime: 0 });
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const canClean = !starting && (preview.data?.archive ?? 0) > 0;
  const confirm = async () => {
    setStarting(true);
    setError(null);
    try {
      await onClean();
      onClose();
    } catch (err) {
      setError(busyMessage(err, { fallbackKey: 'storage.cleanFailed', cleanKey: 'storage.busyClean', nameOf: (id) => id }));
      setStarting(false);
    }
  };
  return (
    <Modal titleId="storage-clean-title" title={t('storage.cleanTitle')} onCancel={onClose}
      actions={<button type="button" className="term-btn term-btn--primary" disabled={!canClean} onClick={confirm}>{t('storage.cleanConfirm')}</button>}>
      <p>{previewText(preview.data, preview.isError)}</p>
      <p className="settings-description">{t('storage.cleanNote')}</p>
      <ModalError message={error} />
    </Modal>
  );
}

function useProjectName() {
  const projects = useQueryClient().getQueryData(projectsKeys.list());
  return (id) => findProject(Array.isArray(projects) ? projects : null, id)?.name || id;
}

// Same shape as deleting a standard: what goes in bold, then type the phrase.
export function DeleteAllModal({ data, onDelete, onClose }) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const nameOf = useProjectName();
  const word = t('storage.deleteAllWord');
  const confirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(busyMessage(err, { fallbackKey: 'storage.deleteFailed', cleanKey: 'storage.busyCleanRunning', nameOf }));
      setDeleting(false);
    }
  };
  const what = { runs: data.runs, projects: Object.keys(data.projects ?? {}).length, size: formatBytes(data.bytes) };
  return (
    <Modal titleId="storage-delete-title" title={t('storage.deleteAllTitle')} onCancel={onClose}
      actions={<button type="button" className="btn-danger" disabled={deleting || typed.toLowerCase().trim() !== word} onClick={confirm}>{t('storage.deleteConfirm')}</button>}>
      <p className="modal-body modal-body--warning">
        {t('storage.deleteAllLead')} <strong>{t('storage.deleteAllWhat', what)}</strong>. {t('storage.deleteAllKept')} {t('standards.cannotBeUndone')}
      </p>
      <p className="modal-body">{t('standards.typePrefix')} <strong>{word}</strong> {t('standards.toConfirmSuffix')}</p>
      <input className="modal-input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={word} aria-label={t('storage.typeToConfirmAria')} autoFocus />
      <ModalError message={error} />
    </Modal>
  );
}
