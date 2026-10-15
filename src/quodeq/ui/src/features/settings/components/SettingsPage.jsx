import { useState, useEffect } from 'react';
import { getProviderConfigs } from '../../../api/index.js';
import AboutSection from './AboutSection.jsx';
import AppearanceSection from './AppearanceSection.jsx';
import UpdatesSection from './UpdatesSection.jsx';
import DesktopSection from './DesktopSection.jsx';
import ProviderTabs from './ProviderTabs.jsx';
import AssistantProviderTabs from './AssistantProviderTabs.jsx';
import ToolbarSection from './ToolbarSection.jsx';
import EvaluationSection from './EvaluationSection.jsx';
import ServerSection from './ServerSection.jsx';
import GitHubAccessSection from './GitHubAccessSection.jsx';
import SharedRepoSection from './SharedRepoSection.jsx';
import OnboardingSection from './OnboardingSection.jsx';
import SettingsGroup from './SettingsGroup.jsx';
import useSettingsGroupStates from '../hooks/useSettingsGroupStates.js';
import { SETTINGS_GROUPS, SETTINGS_GROUP } from '../settingsGroups.js';
import { t } from '../../../strings/index.js';

const _SETTINGS_PHRASE_KEYS = [
  'settingsPhrase.cuore',
  'settingsPhrase.humanAligned',
  'settingsPhrase.safe',
  'settingsPhrase.navigate',
  'settingsPhrase.compass',
];

// What each group holds, keyed by group id. The sections keep their own
// behaviour; the group panel only frames them.
function groupBodies({ providerConfigs, theme, onOpenGradeFormula, onSharedDisconnected, onShowWelcome, settingsPhrase }) {
  return {
    [SETTINGS_GROUP.MODEL]: (<>
      <ProviderTabs providerConfigs={providerConfigs} />
      <AssistantProviderTabs providerConfigs={providerConfigs} />
    </>),
    [SETTINGS_GROUP.EVALUATION]: <EvaluationSection onOpenGradeFormula={onOpenGradeFormula} />,
    [SETTINGS_GROUP.CONNECTIONS]: (<>
      <GitHubAccessSection />
      <SharedRepoSection onDisconnected={onSharedDisconnected} />
    </>),
    [SETTINGS_GROUP.APP]: (<>
      <AppearanceSection themeMode={theme.mode} themeFamily={theme.family} onApplyMode={theme.onApplyMode} onApplyFamily={theme.onApplyFamily} />
      <ToolbarSection />
      <DesktopSection />
      <OnboardingSection onShowWelcome={onShowWelcome} />
      <details className="settings-diagnostics">
        <summary>{t('settings.diagnostics')}</summary>
        <ServerSection />
      </details>
    </>),
    [SETTINGS_GROUP.ABOUT]: (<>
      <UpdatesSection />
      <AboutSection settingsPhrase={settingsPhrase} />
    </>),
  };
}

export default function SettingsPage({ theme, onOpenGradeFormula, onSharedDisconnected, onShowWelcome }) {
  const [settingsPhrase, setSettingsPhrase] = useState('');
  const [providerConfigs, setProviderConfigs] = useState({});
  const states = useSettingsGroupStates({ providerConfigs, theme });

  useEffect(() => {
    setSettingsPhrase(t(_SETTINGS_PHRASE_KEYS[Math.floor(Math.random() * _SETTINGS_PHRASE_KEYS.length)]));
    getProviderConfigs().then(setProviderConfigs).catch(() => setProviderConfigs({}));
  }, []);

  const bodies = groupBodies({ providerConfigs, theme, onOpenGradeFormula, onSharedDisconnected, onShowWelcome, settingsPhrase });
  return (
    <div className="settings-page settings-page--terminal settings-sheet">
      {SETTINGS_GROUPS.map((group) => (
        <SettingsGroup key={group.id} group={group} state={states[group.id]}>{bodies[group.id]}</SettingsGroup>
      ))}
    </div>
  );
}
