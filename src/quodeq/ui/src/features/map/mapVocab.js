// The map's colour/size mode: the `viewMode` nav param, MapPage's toggle and
// the switches in viz/core/mapColors.js. The toggle offers health and
// violations; 'compliance' has no button but mapColors still renders it when
// a link carries it. Not the finding type, though it shares a word with it.
export const MAP_VIEW_MODE = Object.freeze({ HEALTH: 'health', VIOLATIONS: 'violations', COMPLIANCE: 'compliance' });

// The modes MapPage's toggle offers, in display order.
export const VIEW_MODES = [
  { id: MAP_VIEW_MODE.HEALTH, label: 'Health' },
  { id: MAP_VIEW_MODE.VIOLATIONS, label: 'Violations' },
];

// The map's three layout engines (the `vizStyle` nav param): MapPage's
// toggle and useMapPageState's nav-param default.
export const VIZ_STYLE = Object.freeze({ ZOOMPACK: 'zoompack', GALAXY: 'galaxy', RISKMATRIX: 'riskmatrix' });

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
