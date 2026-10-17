import { MIN_SUBAGENTS, MAX_SUBAGENTS, PROVIDER_SETTING_KEY } from '../../../constants.js';
import { SUBAGENTS_HINT_OLLAMA } from './subagentsHints.jsx';
import { clampSubagents } from './localApiSubagents.js';
import { t } from '../../../strings/index.js';
import { SettingsRowLabel } from './settingsRowParts.jsx';

/**
 * The local-API tabs' (Omlx/LlamaCpp/Ollama) max-parallel-agents row:
 * input + auto-detect button + test result/error. The subagents description and the auto-detect
 * button's disabled condition come from the tab.
 */
export function LocalApiSubagentsRow({
  subagentsDescription, state, update, testing, testDisabled, onRunTest, testResult, testError,
  subagentsAriaLabel,
}) {
  return (
    <div className="settings-row">
      <SettingsRowLabel
        label={t('settings.maxParallelAgents')}
        hint={SUBAGENTS_HINT_OLLAMA}
        hintAria={t('settings.maxParallelAgentsHelpAria')}
        description={subagentsDescription}
      />
      <div className="settings-budget-control">
        <input
          type="number"
          aria-label={subagentsAriaLabel}
          className="settings-model-input"
          min={MIN_SUBAGENTS}
          max={MAX_SUBAGENTS}
          value={state.subagents}
          onChange={(e) => update(PROVIDER_SETTING_KEY.SUBAGENTS, e.target.value)}
          onBlur={(e) => { if (e.target.value !== '') update(PROVIDER_SETTING_KEY.SUBAGENTS, clampSubagents(e.target.value)); }}
        />
        <button type="button" className="settings-action-btn" onClick={onRunTest} disabled={testDisabled}>
          {testing ? t('settings.testing') : t('settings.autoDetect')}
        </button>
      </div>
      {testResult && <span className="settings-description">{t('settings.recommendedAgents', { count: testResult.recommended })}</span>}
      {testError && <span className="settings-error">{testError}</span>}
    </div>
  );
}
