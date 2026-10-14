import { useCallback, useState } from 'react';
import { readString, writeString, STORAGE_FLAG_ON, STORAGE_FLAG_OFF } from '../../../adapters/storage.js';

const MAP_TIMELAPSE_KEY = 'quodeq-map-timelapse';
const MAP_LEGEND_KEY = 'quodeq-map-legend';

/** Whether the Map's time-lapse is on, persisted: off until turned on, so the history is only fetched when asked for. */
export function useMapTimelapsePref() {
  const [on, setOn] = useState(() => readString(MAP_TIMELAPSE_KEY) === STORAGE_FLAG_ON);
  const set = useCallback((v) => {
    setOn(v);
    writeString(MAP_TIMELAPSE_KEY, v ? STORAGE_FLAG_ON : STORAGE_FLAG_OFF);
  }, []);
  return [on, set];
}

/** Whether the Map's legends show, persisted: on until turned off. */
export function useMapLegendPref() {
  const [on, setOn] = useState(() => readString(MAP_LEGEND_KEY) !== STORAGE_FLAG_OFF);
  const set = useCallback((v) => {
    setOn(v);
    writeString(MAP_LEGEND_KEY, v ? STORAGE_FLAG_ON : STORAGE_FLAG_OFF);
  }, []);
  return [on, set];
}
