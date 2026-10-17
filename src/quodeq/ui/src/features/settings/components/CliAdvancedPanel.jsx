import { t } from '../../../strings/index.js';
import { SettingsRowLabel, SettingsAdvanced } from './settingsRowParts.jsx';
import CopilotModelSelect from './CopilotModelSelect.jsx';
import { PROVIDER_SETTING_KEY } from '../../../constants.js';

// Display names for the effort levels a provider lists in ai_providers.json
// (`effort_levels`); a level missing here shows its raw id.
const EFFORT_LABELS = {
  low: t('settings.effortLow'),
  medium: t('settings.effortMedium'),
  high: t('settings.effortHigh'),
  xhigh: t('settings.effortXhigh'),
  max: t('settings.effortMax'),
};

// The one CLI provider whose models come from a live account lookup instead
// of a free-text field.
const COPILOT_PROVIDER_ID = 'copilot';

/** Use live model choices for Copilot without changing other CLI providers. */
export function CliModelInput({ providerId, ...props }) {
  return providerId === COPILOT_PROVIDER_ID ? <CopilotModelSelect {...props} /> : <ModelTextInput {...props} />;
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

function EffortRow({ levels, state, update }) {
  const effort = levels.includes(state[PROVIDER_SETTING_KEY.EFFORT]) ? state[PROVIDER_SETTING_KEY.EFFORT] : '';
  return (
    <div className="settings-row">
      <SettingsRowLabel
        label={t('settings.effort')}
        hint={t('settings.effortHint')}
        hintAria={t('settings.effortHelpAria')}
        description={t('settings.effortDesc')}
      />
      <div className="settings-pill-group" role="group" aria-label={t('settings.effort')}>
        <EffortPill active={!effort} onClick={() => update(PROVIDER_SETTING_KEY.EFFORT, '')}>{t('settings.effortDefault')}</EffortPill>
        {levels.map((level) => (
          <EffortPill key={level} active={effort === level} onClick={() => update(PROVIDER_SETTING_KEY.EFFORT, level)}>
            {EFFORT_LABELS[level] || level}
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
 * A CLI provider tab's advanced settings: the reasoning effort (only for a
 * provider whose ai_providers.json entry lists `effort_levels`) and the
 * launch-command override.
 */
export function CliAdvancedPanel({
  providerId, providerConfig, state, update, cmdPathError, validateCmdPath,
}) {
  const effortLevels = providerConfig?.effort_levels || [];
  return (
    <SettingsAdvanced>
      {effortLevels.length > 0 && <EffortRow levels={effortLevels} state={state} update={update} />}
      <CmdOverrideRow providerId={providerId} state={state} update={update} cmdPathError={cmdPathError} validateCmdPath={validateCmdPath} />
    </SettingsAdvanced>
  );
}
