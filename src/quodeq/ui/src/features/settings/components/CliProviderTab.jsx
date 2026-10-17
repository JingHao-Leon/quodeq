import { TimeLimitSetting } from './ProviderSettings.jsx';
import { SettingsRowLabel, RemoteSubagentsRow } from './settingsRowParts.jsx';
import { CliAdvancedPanel, CliModelInput } from './CliAdvancedPanel.jsx';
import { useCliProviderTab } from '../hooks/useCliProviderTab.js';
import { modelEffort, useClientModels } from '../hooks/useClientModels.js';
import { t } from '../../../strings/index.js';
import { CopilotModelStatus } from './CopilotModelSelect.jsx';
import { PROVIDER } from '../../../vocab/provider.js';
import { PROVIDER_CLASSIFICATION } from './providerUtils.js';
import { PROVIDER_SETTING_KEY } from '../../../constants.js';

export default function CliProviderTab({ providerId, providerConfig, state, update }) {
  const {
    cmdPathError, validateCmdPath, hint, clampSubagents,
  } = useCliProviderTab({ providerId, state });
  const { data: catalog } = useClientModels(providerId);

  // A stored effort the new model does not take would be refused at start,
  // so switching models drops it back to Default.
  function changeModel(next) {
    update(PROVIDER_SETTING_KEY.MODEL, next);
    const effort = state[PROVIDER_SETTING_KEY.EFFORT];
    if (effort && !modelEffort(catalog, next, providerConfig?.effort_levels).levels.includes(effort)) {
      update(PROVIDER_SETTING_KEY.EFFORT, '');
    }
  }

  return (
    <>
      {providerId === PROVIDER.COPILOT && <CopilotModelStatus />}
      <div className="settings-row">
        <SettingsRowLabel
          label={t('settings.modelLabel')}
          hint={hint}
          hintAria={t('settings.modelHelpAria')}
          description={t('settings.pickModelYouWant')}
        />
        <div className="settings-model-field">
          <CliModelInput providerId={providerId} value={state.model} onChange={changeModel} required />
          {!state.model && <span className="settings-model-hint">{t('settings.pickModelToStart')}</span>}
        </div>
      </div>
      <TimeLimitSetting state={state} update={update} providerType={PROVIDER_CLASSIFICATION.CLI} />
      <RemoteSubagentsRow state={state} update={update} clampSubagents={clampSubagents} />
      <CliAdvancedPanel
        providerId={providerId} providerConfig={providerConfig} state={state} update={update}
        cmdPathError={cmdPathError} validateCmdPath={validateCmdPath}
      />
    </>
  );
}
