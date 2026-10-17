import { t } from '../../../../strings/index.js';
import { ACTIVITY_SOURCE, PACK_COLOR_MODE } from '../../mapVocab.js';

function activityNote(source, loading) {
  if (loading) return t('map.legendActivityLoading');
  if (source === ACTIVITY_SOURCE.GIT) return t('map.legendActivityGit');
  if (source === ACTIVITY_SOURCE.ESTIMATED) return t('map.legendActivityEstimated');
  return t('map.activityUnavailable');
}

/**
 * Legend for the Circle Pack: a gradient bar for the current colour mode and its notes.
 * @param {{mode: string, activitySource: string, activityLoading: boolean}} props
 */
export default function PackLegend({ mode, activitySource, activityLoading }) {
  const activity = mode === PACK_COLOR_MODE.ACTIVITY;
  return (
    <div className="pack-legend" aria-live="polite">
      <div className="pack-legend-title">{activity ? t('map.legendActivityTitle') : t('map.legendConcentrationTitle')}</div>
      <div className="pack-legend-row">
        <span>{activity ? t('map.legendActivityLow') : t('map.legendBetter')}</span>
        <span className={activity ? 'pack-legend-bar pack-legend-bar--activity' : 'pack-legend-bar'} aria-hidden="true" />
        <span>{activity ? t('map.legendActivityHigh') : t('map.legendWorse')}</span>
      </div>
      <div className="pack-legend-note">{activity ? activityNote(activitySource, activityLoading) : t('map.legendCapped')}</div>
      <div className="pack-legend-note">{t('map.legendSize')}</div>
    </div>
  );
}
