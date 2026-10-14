import { t } from '../../../strings/index.js';

function Toggle({ checked, onChange, label }) {
  return (
    <label className="map-label-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/**
 * The switches in the map's corner: labels, legends, the time-lapse (where the tab
 * has one: Circle Pack and Risk, local projects) and, under a light app
 * theme, light or dark viz.
 */
export default function MapVizToggles({ display, appIsDark, timelapseToggle, legendToggle }) {
  const { showLabels, setShowLabels, darkMode, setDarkMode } = display;
  return (
    <div className="map-viz-toggles">
      {timelapseToggle.available && <Toggle checked={timelapseToggle.on} onChange={timelapseToggle.onChange} label={t('map.timelapseToggle')} />}
      <Toggle checked={showLabels} onChange={setShowLabels} label={t('map.labels')} />
      <Toggle checked={legendToggle.on} onChange={legendToggle.onChange} label={t('map.legendToggle')} />
      {!appIsDark && <Toggle checked={!darkMode} onChange={(v) => setDarkMode(!v)} label={t('map.light')} />}
    </div>
  );
}
