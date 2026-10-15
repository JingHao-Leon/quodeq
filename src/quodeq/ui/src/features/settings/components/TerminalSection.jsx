import useTerminalSettings from '../hooks/useTerminalSettings.js';
import { useTerminalRestart } from '../hooks/useTerminalRestart.js';
import { t } from '../../../strings/index.js';
import { SettingsEnableRow } from './settingsRowParts.jsx';

/** The terminal switch and, while it is on, the restart row. */
export default function TerminalRows() {
  const { enabled, setEnabled } = useTerminalSettings();
  const restart = useTerminalRestart();
  return (
    <>
      <SettingsEnableRow
        enabled={enabled}
        setEnabled={setEnabled}
        label={t('settings.terminalEnable')}
        description={t('settings.terminalEnableDesc')}
      />
      {enabled && (
        <div className="settings-row settings-row--last">
          <span className="settings-description">{t('settings.terminalRestartDesc')}</span>
          <button type="button" className="settings-pill" onClick={restart}>
            {t('settings.restartTerminal')}
          </button>
        </div>
      )}
    </>
  );
}
