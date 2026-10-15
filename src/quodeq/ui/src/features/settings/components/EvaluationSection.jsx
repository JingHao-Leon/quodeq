import useLiveFeedSettings from '../hooks/useLiveFeedSettings.js';
import SectionLabel from '../../../components/terminal/SectionLabel.jsx';
import { t } from '../../../strings/index.js';
import { SettingsPillTabs, SettingsRowLabel } from './settingsRowParts.jsx';

export default function EvaluationSection({ onOpenGradeFormula }) {
  const { newOnly, setNewOnly } = useLiveFeedSettings();
  return (
    <section className="panel settings-section">
      <div className="panel-header"><SectionLabel marker="▶">{t('settings.resultsLabel')}</SectionLabel></div>
      <div className="settings-row">
        <SettingsRowLabel hintSlot={false} label={t('settings.liveFindings')} description={t('settings.liveFindingsDesc')} />
        <SettingsPillTabs
          options={[{ v: true, l: t('settings.liveFindingsNewOnly') }, { v: false, l: t('evaluate.allCap') }]}
          value={newOnly}
          onChange={setNewOnly}
        />
      </div>
      <button type="button" className="settings-row settings-row--last settings-link-row" onClick={onOpenGradeFormula}>
        <span className="settings-row-label">
          <span className="settings-label">{t('settings.gradeFormula')}</span>
          <span className="settings-description">{t('settings.gradeFormulaDesc')}</span>
        </span>
        <span className="settings-link-row__go">{t('settings.openEditorLink')}</span>
      </button>
    </section>
  );
}
