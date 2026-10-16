import { useCallback, useRef, useState } from 'react';
import { useApi } from '../../../api/ApiContext.jsx';
import { confirmDialog } from '../../../utils/confirmDialog.js';
import { apiErrorMessage } from '../../../strings/apiErrors.js';
import { t } from '../../../strings/index.js';
import { SYNC_ACTION } from '../../../models/standardSync.js';

const CONFIRM_KEYS = {
  [SYNC_ACTION.PUBLISH]: { title: 'standards.syncConfirmPublishTitle', message: 'standards.syncConfirmPublishBody', confirm: 'standards.syncPublish' },
  [SYNC_ACTION.UPDATE]: { title: 'standards.syncConfirmUpdateTitle', message: 'standards.syncConfirmUpdateBody', confirm: 'standards.syncUpdate' },
};

function callFor(api, action, id, force) {
  if (action === SYNC_ACTION.INSTALL) return api.installStandard(id);
  if (action === SYNC_ACTION.UPDATE) return api.updateStandardFromShared(id, { force });
  return api.shareStandard(id, { force });
}

async function confirmed(action, force, name) {
  const keys = CONFIRM_KEYS[action];
  if (!force || !keys) return true;
  return confirmDialog({
    title: t(keys.title),
    message: t(keys.message, { name }),
    confirmLabel: t(keys.confirm),
    variant: 'danger',
  });
}

/** Run share / publish / update / install for one row at a time, with per-row errors. */
export function useStandardSync({ refresh }) {
  const api = useApi();
  const [pendingId, setPendingId] = useState(null);
  const [errors, setErrors] = useState({});
  const busy = useRef(false);

  const run = useCallback(async (standard, { action, force = false }) => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (!(await confirmed(action, force, standard.name))) return;
      setPendingId(standard.id);
      setErrors((e) => ({ ...e, [standard.id]: undefined }));
      await callFor(api, action, standard.id, force);
      refresh();
    } catch (err) {
      console.warn('[useStandardSync] sync failed', err);
      setErrors((e) => ({ ...e, [standard.id]: apiErrorMessage(err, 'standards.syncFailed') }));
    } finally {
      busy.current = false;
      setPendingId(null);
    }
  }, [api, refresh]);

  return { run, pendingId, errors };
}
