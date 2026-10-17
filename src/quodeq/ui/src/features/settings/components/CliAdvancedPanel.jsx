import { t } from '../../../strings/index.js';
import { SettingsRowLabel, SettingsAdvanced } from './settingsRowParts.jsx';
import CopilotModelSelect from './CopilotModelSelect.jsx';
import CliModelPicker from './CliModelPicker.jsx';
import { CATALOG_PROVIDERS, modelEffort, useClientModels } from '../hooks/useClientModels.js';
import { PROVIDER_SETTING_KEY } from '../../../constants.js';

// Display names for effort levels (from the live model catalog or
// ai_providers.json's `effort_levels`); a level missing here shows its raw id.
const EFFORT_LABELS = {
  low: t('settings.effortLow'),
  medium: t('settings.effortMedium'),
  high: t('settings.effortHigh'),
  xhigh: t('settings.effortXhigh'),
  max: t('settings.effortMax'),
  ultra: t('settings.effortUltra'),
};

// Copilot lists account models through its own RPC (ids only).
const COPILOT_PROVIDER_ID = 'copilot';

/**
 * The model field for a CLI provider: a live dropdown where the CLI can list
 * its models (Copilot, Claude Code, Codex), a text field otherwise.
 */
export function CliModelInput({ providerId, ...props }) {
  if (providerId === COPILOT_PROVIDER_ID) return <CopilotModelSelect {...props} />;
  if (CATALOG_PROVIDERS.includes(providerId)) return <CliModelPicker providerId={providerId} {...props} />;
  return <ModelTextInput {...props} />;
}

export function ModelTextInput({ label, value, placeholder, onChange, required, ariaLabel }) {
  const inputId = `model-input-${label || 'default'}`;
  return (
    <div className="settings-model-field">
      {label && <label className="settings-model-label" htmlFor={inputId}>{label}</label>}
      <input
        type="text"
        id={inputId}
        className={`settings-model-input${required && !value ? ' settings-model-input--required' : ''}`}
        value={value || ''}
        placeholder={placeholder || t('settings.typeModelId')}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel || (label ? t('settings.modelNameAria', { label }) : t('settings.modelAria'))}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}

function EffortPill({ active, onClick, children }) {
  return (
    <button type="button" className={`settings-pill${active ? ' settings-pill--active' : ''}`} onClick={onClick} aria-pressed={active}>
      {children}
    </button>
  );
}

function effortLabel(level) {
  return EFFORT_LABELS[level] || level;
}

function EffortRow({ levels, defaultEffort, state, update }) {
  const effort = levels.includes(state[PROVIDER_SETTING_KEY.EFFORT]) ? state[PROVIDER_SETTING_KEY.EFFORT] : '';
  const defaultLabel = defaultEffort
    ? t('settings.effortDefaultNamed', { level: effortLabel(defaultEffort) })
    : t('settings.effortDefault');
  return (
    <div className="settings-row">
      <SettingsRowLabel
        label={t('settings.effort')}
        hint={t('settings.effortHint')}
        hintAria={t('settings.effortHelpAria')}
        description={t('settings.effortDesc')}
      />
      <div className="settings-pill-group" role="group" aria-label={t('settings.effort')}>
        <EffortPill active={!effort} onClick={() => update(PROVIDER_SETTING_KEY.EFFORT, '')}>{defaultLabel}</EffortPill>
        {levels.map((level) => (
          <EffortPill key={level} active={effort === level} onClick={() => update(PROVIDER_SETTING_KEY.EFFORT, level)}>
            {effortLabel(level)}
          </EffortPill>
        ))}
      </div>
    </div>
  );
}

function CmdOverrideRow({ providerId, state, update, cmdPathError, validateCmdPath }) {
  return (
    <div className="settings-row">
      <SettingsRowLabel
        label={t('settings.cmdOverride')}
        hint={t('settings.cmdOverrideHint', { provider: providerId })}
        hintAria={t('settings.cmdOverrideHelpAria')}
        description={t('settings.cmdOverrideDesc', { provider: providerId })}
      />
      <div className="settings-model-field">
        <input
          type="text"
          className="settings-model-input"
          value={state[PROVIDER_SETTING_KEY.CMD_PATH] || ''}
          placeholder={providerId}
          onChange={(e) => update(PROVIDER_SETTING_KEY.CMD_PATH, e.target.value.trim())}
          onBlur={validateCmdPath}
          aria-label={t('settings.cmdOverride')}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
        />
        {cmdPathError && (
          <span className="settings-model-hint settings-error" role="alert">
            {cmdPathError}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * A CLI provider tab's advanced settings: the reasoning effort and the
 * launch-command override. Effort offers what the selected model takes (live
 * catalog), else the provider's `effort_levels`; it hides when there are none.
 */
export function CliAdvancedPanel({
  providerId, providerConfig, state, update, cmdPathError, validateCmdPath,
}) {
  const { data: catalog } = useClientModels(providerId);
  const { levels, defaultEffort } = modelEffort(catalog, state[PROVIDER_SETTING_KEY.MODEL], providerConfig?.effort_levels);
  return (
    <SettingsAdvanced>
      {levels.length > 0 && <EffortRow levels={levels} defaultEffort={defaultEffort} state={state} update={update} />}
      <CmdOverrideRow providerId={providerId} state={state} update={update} cmdPathError={cmdPathError} validateCmdPath={validateCmdPath} />
    </SettingsAdvanced>
  );
}
