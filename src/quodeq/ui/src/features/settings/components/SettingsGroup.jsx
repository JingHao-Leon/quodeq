import { t } from '../../../strings/index.js';
import { STATE_TONE } from '../settingsGroups.js';

/**
 * One settings group as a sheet panel: a gutter naming the group and its
 * current state, then the group's sections, merged into this one card.
 */
export default function SettingsGroup({ group, state, children }) {
  const headingId = `settings-group-${group.id}`;
  return (
    <section className={`panel settings-group settings-group--${group.id}`} aria-labelledby={headingId}>
      <header className="settings-group__gutter">
        <div className="settings-group__sticky">
          <h2 className="settings-group__name" id={headingId}>{t(group.labelKey)}</h2>
          <p className="settings-group__desc">{t(group.descKey)}</p>
          {state && (
            <p className="settings-group__state">
              {state.tone !== STATE_TONE.NONE && <span className={`settings-group__dot settings-group__dot--${state.tone}`} aria-hidden="true" />}
              {state.text}
            </p>
          )}
        </div>
      </header>
      <div className="settings-group__body">{children}</div>
    </section>
  );
}
