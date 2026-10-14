/**
 * How other pages open the Map's Risk tab: the navigation params of the tab,
 * filtered to some dimensions (or one principle of one dimension) and with
 * an area selected, as the Map's route reads them (routes/mapRoute.jsx).
 */
import { VIZ_STYLE } from '../mapVocab.js';

/**
 * The Map nav params of the Risk tab; a filter or an area only when given.
 * @param {{dimensions?: string[], principle?: string, area?: string}} [link]
 * @returns {{vizStyle: string, dimensions?: string[], principle?: string, area?: string}}
 */
export function riskMapParams({ dimensions = null, principle = null, area = null } = {}) {
  return {
    vizStyle: VIZ_STYLE.RISK,
    ...(dimensions?.length ? { dimensions } : {}),
    ...(principle ? { principle } : {}),
    ...(area ? { area } : {}),
  };
}
