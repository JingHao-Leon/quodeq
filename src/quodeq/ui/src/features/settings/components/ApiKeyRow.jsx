import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../../api/ApiContext.jsx';
import { PROVIDER_SETTING_KEY } from '../../../constants.js';
import { t } from '../../../strings/index.js';
import { SettingsRowLabel } from './settingsRowParts.jsx';

const keyStatusQuery = (providerId) => ['provider', 'key-status', providerId];

/** The masked entry field and its save button, shown until a key is stored. */
function KeyEntry({ inputId, labelId, draft, setDraft, onSave }) {
  return (
    <div className="settings-budget-control">
      <input
        id={inputId}
        type="password"
        className="settings-model-input"
        value={draft}
        placeholder={t('settings.apiKeyPlaceholder')}
        onChange={(e) => setDraft(e.target.value)}
        aria-labelledby={labelId}
        autoComplete="off"
        spellCheck={false}
      />
      <button type="button" className="settings-pill" onClick={onSave} disabled={!draft.trim()}>
        {t('settings.apiKeySave')}
      </button>
    </div>
  );
}

/**
 * A write-only API key row. The key goes to the system keychain through
 * `update`; the row only ever learns whether one is stored, never the key.
 * `onSaved` runs once the write has landed (e.g. to reload a model list).
 */
export default function ApiKeyRow({ providerId, update, description, onSaved }) {
  const { getProviderKeyStatus } = useApi();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: keyStatusQuery(providerId), queryFn: () => getProviderKeyStatus(providerId) });
  const [draft, setDraft] = useState('');
  const [replacing, setReplacing] = useState(false);
  const inputId = `api-key-${providerId}`;
  const labelId = `${inputId}-label`;
  const stored = Boolean(data?.configured) && !replacing;

  const save = () => {
    const value = draft.trim();
    if (!value) return;
    // Clear and re-read only once the keychain write has landed. A refused
    // write keeps the typed key (the toast says why) so it can be retried.
    Promise.resolve(update(PROVIDER_SETTING_KEY.API_KEY, value))
      .then((ok) => {
        if (ok === false) return;
        setDraft('');
        setReplacing(false);
        queryClient.invalidateQueries({ queryKey: keyStatusQuery(providerId) });
        onSaved?.();
      })
      .catch((err) => console.warn('[ApiKeyRow] key save follow-up failed:', err));
  };

  return (
    <div className="settings-row">
      <SettingsRowLabel hintSlot={false} label={t('settings.apiKey')} description={description} labelId={labelId} />
      {stored ? (
        <div className="settings-pill-group">
          <span className="settings-description" role="status">{t('settings.apiKeySaved')}</span>
          <button type="button" className="settings-pill" onClick={() => setReplacing(true)}>{t('settings.apiKeyReplace')}</button>
        </div>
      ) : (
        <KeyEntry inputId={inputId} labelId={labelId} draft={draft} setDraft={setDraft} onSave={save} />
      )}
    </div>
  );
}
