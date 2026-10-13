import { t } from '../../../../strings/index.js';
import { formatShortDate } from '../../../../utils/formatters.js';
import { ABSENCE } from '../core/timelapseScene.js';
import { dayDate } from '../core/timelapseBarModel.js';

const NOTE_KEY = new Map([[ABSENCE.GONE_SINCE, 'map.timelapseGoneSince'], [ABSENCE.FIRST_APPEARS, 'map.timelapseFirstAppears']]);

/**
 * The tooltip line of a circle absent from the run shown, or null when it is present.
 * @param {{kind: string, day: string}|null} note absenceNote(...)
 * @returns {string|null}
 */
export function timelapseNoteText(note) {
  if (!note) return null;
  return t(NOTE_KEY.get(note.kind), { date: formatShortDate(dayDate(note.day).toISOString()) });
}
