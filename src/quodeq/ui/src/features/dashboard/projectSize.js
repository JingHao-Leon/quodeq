/**
 * A project's size as the Overview reads it off the projects list: one
 * source-file count and its languages by file count. The head's sub line
 * and the never-evaluated panel both read it here, so the page shows one
 * count.
 */

/**
 * The project's source-file count, null when the list does not carry one.
 * @param {{filesCount?: number|null}|null|undefined} projectInfo
 * @returns {number|null}
 */
export function projectFileCount(projectInfo) {
  return projectInfo?.filesCount ?? null;
}

/**
 * The project's languages as [extension, file count] pairs, largest first,
 * at most `max`; empty without stats.
 * @param {{languageStats?: Object<string, number>|null}|null|undefined} projectInfo
 * @param {number} max
 * @returns {Array<[string, number]>}
 */
export function topLanguageStats(projectInfo, max) {
  const stats = projectInfo?.languageStats;
  return stats ? Object.entries(stats).sort(([, a], [, b]) => b - a).slice(0, max) : [];
}
