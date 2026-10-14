import { useCallback, useState } from 'react';
import { readString, writeString, STORAGE_FLAG_ON, STORAGE_FLAG_OFF } from '../../../adapters/storage.js';

const MAP_TIMELAPSE_KEY = 'quodeq-map-timelapse';
const MAP_LEGEND_KEY = 'quodeq-map-legend';

/** An on/off switch kept in storage under `key`, `fallback` until it is first set. */
function usePersistedFlag(key, fallback) {
  const [on, setOn] = useState(() => {
    const stored = readString(key);
    return stored === null ? fallback : stored === STORAGE_FLAG_ON;
  });
  const set = useCallback((v) => {
    setOn(v);
    writeString(key, v ? STORAGE_FLAG_ON : STORAGE_FLAG_OFF);
  }, [key]);
  return [on, set];
}

/** Whether the Map's time-lapse is on, persisted: off until turned on, so the history is only fetched when asked for. */
export function useMapTimelapsePref() {
  return usePersistedFlag(MAP_TIMELAPSE_KEY, false);
}

/** Whether the Map's legends show, persisted: on until turned off. */
export function useMapLegendPref() {
  return usePersistedFlag(MAP_LEGEND_KEY, true);
}
