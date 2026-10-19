import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useFolderPicker } from '../../dashboard/hooks/useFolderPicker.jsx';
import { invalidateProjects } from '../../../hooks/invalidateProjects.js';
import { apiErrorMessage } from '../../../strings/apiErrors.js';
import { t } from '../../../strings/index.js';

/**
 * The step a local project shows on Evaluate when its folder is not on this
 * machine: moved, deleted, or pulled from someone else's computer (a pull
 * keeps the publisher's path). The person points it at their own copy, or,
 * when the project knows its repository URL, has quodeq clone that instead
 * (the project turns online and Evaluate clones it on run). Either way the
 * card re-reads the project and the projects list catches up.
 *
 * @param {{ info: { path?: string|null, originUrl?: string|null }, relocate: (target: string) => Promise<void> }} props
 */
export default function LocateCodeSection({ info, relocate }) {
  const queryClient = useQueryClient();
  const { browseFolder, picker } = useFolderPicker({ title: t('evaluate.locatePickerTitle') });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function moveTo(target) {
    if (!target) return;
    setSaving(true);
    setError(null);
    try {
      await relocate(target);
      invalidateProjects(queryClient);
    } catch (err) {
      setError(apiErrorMessage(err, 'evaluate.locateFailed'));
    } finally {
      setSaving(false);
    }
  }

  const url = info.originUrl || null;
  return (
    <section className="re-eval-stale-warning re-eval-locate" aria-label={t('evaluate.locateAria')}>
      <p>{info.path ? t('evaluate.locateBody', { path: info.path }) : t('evaluate.locateBodyNoPath')}</p>
      <div className="re-eval-locate__actions">
        <button type="button" className="term-btn term-btn--primary term-btn--filled" disabled={saving} onClick={async () => moveTo(await browseFolder())}>
          {saving ? t('evaluate.saving') : t('evaluate.locateChoose')}
        </button>
        {url && (
          <button type="button" className="term-btn term-btn--secondary" disabled={saving} title={url} onClick={() => moveTo(url)}>
            {t('evaluate.locateUseUrl')}
          </button>
        )}
      </div>
      {url && <p className="re-eval-locate__url">{t('evaluate.locateUrlHint', { url })}</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {picker}
    </section>
  );
}
