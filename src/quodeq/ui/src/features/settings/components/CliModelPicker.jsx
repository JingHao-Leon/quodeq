import { useId, useState } from 'react';
import { useClientModels, findCatalogModel } from '../hooks/useClientModels.js';
import { t } from '../../../strings/index.js';

// The select value that switches the field to a typed model id.
const OTHER_VALUE = '__other__';

function modelInputClass(required, value) {
  return `settings-model-input${required && !value ? ' settings-model-input--required' : ''}`;
}

function optionLabel(entry) {
  return entry.isDefault ? t('settings.modelRecommended', { label: entry.label }) : entry.label;
}

function ModelOptions({ catalog }) {
  const latest = catalog.filter((entry) => !entry.pinned);
  const pinned = catalog.filter((entry) => entry.pinned);
  const render = (entries) => entries.map((entry) => <option key={entry.id} value={entry.id}>{optionLabel(entry)}</option>);
  if (!pinned.length) return render(latest);
  return (
    <>
      <optgroup label={t('settings.modelGroupLatest')}>{render(latest)}</optgroup>
      <optgroup label={t('settings.modelGroupPinned')}>{render(pinned)}</optgroup>
    </>
  );
}

function RefreshButton({ onRefresh, busy }) {
  return (
    <button
      type="button" className="settings-action-btn settings-model-refresh" onClick={onRefresh} disabled={busy}
      aria-label={t('settings.refreshModels')} title={t('settings.refreshModels')}
    >
      ↻
    </button>
  );
}

function TypedModelInput({ inputId, value, onChange, required, ariaLabel }) {
  return (
    <input
      type="text" id={inputId}
      className={modelInputClass(required, value)}
      value={value || ''} placeholder={t('settings.typeModelId')} onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel || t('settings.modelAria')}
      autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
    />
  );
}

/**
 * The model field for a CLI that lists its own models (Claude Code, Codex):
 * a dropdown of what the signed-in account offers, with the selected model's
 * description under it. "Other model id" keeps a typed id possible, and a
 * failed lookup falls back to the plain text field.
 */
export default function CliModelPicker({ providerId, value, onChange, required, ariaLabel }) {
  const inputId = useId();
  const { data: catalog, isPending, error, isFetching, refresh } = useClientModels(providerId);
  const listed = findCatalogModel(catalog, value);
  const [typing, setTyping] = useState(false);
  const typed = typing || Boolean(value && catalog && !listed);
  // The query's own error state shows a failed refresh; this only logs it.
  const onRefresh = () => refresh().catch((err) => console.warn('[CliModelPicker] model list refresh failed:', err));

  if (error) {
    return (
      <div className="settings-model-field">
        <div className="settings-model-select-row">
          <TypedModelInput inputId={inputId} value={value} onChange={onChange} required={required} ariaLabel={ariaLabel} />
          <RefreshButton onRefresh={onRefresh} busy={isFetching} />
        </div>
        <span className="settings-description" role="status">{t('settings.modelsUnavailable')}</span>
      </div>
    );
  }

  function choose(next) {
    setTyping(next === OTHER_VALUE);
    if (next !== OTHER_VALUE) onChange(next);
  }

  return (
    <div className="settings-model-field">
      <div className="settings-model-select-row">
        <select
          id={inputId}
          className={modelInputClass(required, value)}
          value={typed ? OTHER_VALUE : (value || '')}
          onChange={(e) => choose(e.target.value)}
          aria-label={ariaLabel || t('settings.modelAria')}
          disabled={isPending}
        >
          <option value="" disabled>{isPending ? t('settings.modelsLoading') : t('settings.pickAModel')}</option>
          {catalog && <ModelOptions catalog={catalog} />}
          <option value={OTHER_VALUE}>{t('settings.otherModelId')}</option>
        </select>
        <RefreshButton onRefresh={onRefresh} busy={isFetching} />
      </div>
      {typed && <TypedModelInput value={value} onChange={onChange} required={required} ariaLabel={t('settings.otherModelId')} />}
      {listed?.description && <span className="settings-description">{listed.description}</span>}
    </div>
  );
}
