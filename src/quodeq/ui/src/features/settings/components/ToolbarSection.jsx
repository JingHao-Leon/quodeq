import SectionLabel from '../../../components/terminal/SectionLabel.jsx';
import { t } from '../../../strings/index.js';
import { AssistantEnableRow } from './AssistantProviderTabs.jsx';
import TerminalRows from './TerminalRows.jsx';

/** The tools that sit in the toolbar: the assistant and the terminal. */
export default function ToolbarSection() {
  return (
    <section className="panel settings-section">
      <div className="panel-header"><SectionLabel marker="▶">{t('settings.toolbarLabel')}</SectionLabel></div>
      <AssistantEnableRow />
      <TerminalRows />
    </section>
  );
}
