import { TimelapseBar } from '../viz/index.js';
import { TIMELAPSE_STATUS } from '../model/timelapsePlayback.js';
import { t } from '../../../strings/index.js';

const MIN_RUNS = 2;

function Note({ text, role }) {
  return <p className="map-timelapse-note" role={role}>{text}</p>;
}

/**
 * What sits under the map: the time-lapse bar, a loading or failure note, or,
 * on the Circle Pack with a Dimensions filter, why there is no bar. Nothing
 * for shared projects or a history of fewer than two runs.
 */
export default function MapTimelapseFooter({ timelapse, filtered }) {
  if (timelapse.status === TIMELAPSE_STATUS.OFF) return null;
  if (filtered) return <Note text={t('map.timelapseFiltered')} role="note" />;
  if (timelapse.status === TIMELAPSE_STATUS.LOADING) return <Note text={t('map.timelapseLoading')} role="status" />;
  if (timelapse.status === TIMELAPSE_STATUS.FAILED) return <Note text={t('map.timelapseFailed')} role="status" />;
  if (timelapse.data.runs.length < MIN_RUNS) return null;
  return <TimelapseBar timelapse={timelapse} />;
}
