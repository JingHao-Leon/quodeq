import { RISK_ZONE } from '../../vocab/riskZone.js';

// The map's colour/size mode: the `viewMode` nav param and the switches in
// viz/core/mapColors.js. The Circle Pack and Activity tabs colour the pack by
// their PACK_COLOR_MODE; these health, violations and compliance values are
// what the other views and older nav entries carry.
// Not the finding type, though it shares a word with it.
export const MAP_VIEW_MODE = Object.freeze({ HEALTH: 'health', VIOLATIONS: 'violations', COMPLIANCE: 'compliance' });

// The map's tabs (the `vizStyle` nav param): MapPage's toggle and
// useMapPageState's nav-param default. Circle Pack and Activity are the same
// pack, coloured by concentration or by activity.
export const VIZ_STYLE = Object.freeze({ ZOOMPACK: 'zoompack', ACTIVITY: 'activity', RISK: 'risk', GALAXY: 'galaxy' });
// The Risk Matrix's old nav value: entries saved before the Risk tab open it.
const LEGACY_RISK_MATRIX = 'riskmatrix';
// The pack's old Activity colour (`viewMode`): entries saved before the Activity tab open it.
const LEGACY_PACK_ACTIVITY = 'activity';
const VIZ_STYLE_VALUES = new Set(Object.values(VIZ_STYLE));

/**
 * The view for a nav value: the old Risk Matrix opens Risk, the Circle Pack
 * coloured by activity (entries saved before Activity was a tab) opens
 * Activity, anything unknown (or missing) the Circle Pack.
 * @param {string|undefined} value the `vizStyle` nav param
 * @param {string|undefined} [viewMode] the `viewMode` nav param
 * @returns {string} a VIZ_STYLE value
 */
export function normalizeVizStyle(value, viewMode) {
  if (value === LEGACY_RISK_MATRIX) return VIZ_STYLE.RISK;
  const style = VIZ_STYLE_VALUES.has(value) ? value : VIZ_STYLE.ZOOMPACK;
  return style === VIZ_STYLE.ZOOMPACK && viewMode === LEGACY_PACK_ACTIVITY ? VIZ_STYLE.ACTIVITY : style;
}

// Sub-mode of VIZ_STYLE.GALAXY (the `galaxyMode` nav param): grouped by
// folder structure or by standard/dimension.
export const GALAXY_MODE = Object.freeze({ FILESYSTEM: 'filesystem', STANDARDS: 'standards' });

/** How a pack node is judged: a file, a folder holding only files, or a folder with sub-folders. */
export const NODE_KIND = Object.freeze({ FILE: 'file', FOLDER: 'folder', PARENT: 'parent' });

/** Where the Map's activity came from (map history payload `activitySource`). */
export const ACTIVITY_SOURCE = Object.freeze({ GIT: 'git', ESTIMATED: 'estimated', NONE: 'none' });

/** Which history frames to fetch. */
export const MAP_FRAMES = Object.freeze({ LATEST: 'latest', ALL: 'all' });

/** Circle Pack colour modes (spec 2.1, 2.2). */
export const PACK_COLOR_MODE = Object.freeze({ CONCENTRATION: 'concentration', ACTIVITY: 'activity' });

/**
 * Whether a tab draws the circle pack (Circle Pack or Activity).
 * @param {string} vizStyle a VIZ_STYLE value
 * @returns {boolean}
 */
export function isPackStyle(vizStyle) {
  return vizStyle === VIZ_STYLE.ZOOMPACK || vizStyle === VIZ_STYLE.ACTIVITY;
}

/**
 * The pack's colour mode on a tab: Activity colours by edits, every other tab by concentration.
 * @param {string} vizStyle a VIZ_STYLE value
 * @returns {string} a PACK_COLOR_MODE value
 */
export function packColorModeOf(vizStyle) {
  return vizStyle === VIZ_STYLE.ACTIVITY ? PACK_COLOR_MODE.ACTIVITY : PACK_COLOR_MODE.CONCENTRATION;
}

/** Area kinds from the map history (backend `AreaKind`). */
export const AREA_KIND = Object.freeze({ HOTSPOT: 'hotspot', DORMANT: 'dormant', WATCH: 'watch', HEALTHY: 'healthy', SMALL: 'small' });
/** Kinds that wear a ring on the Risk sky: hotspot solid, dormant dashed (spec 2.4). */
export const RING_KINDS = Object.freeze([AREA_KIND.HOTSPOT, AREA_KIND.DORMANT]);

/** The Risk sky's zones by density: past fix first, between watch and fix first, below watch (the shared RISK_ZONE). */
export const SKY_ZONE = RISK_ZONE;
