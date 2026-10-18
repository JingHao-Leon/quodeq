/**
 * Settings › Storage: the space evaluations take, how many runs stay in full,
 * "clean now" and "delete all" (api/routes_storage.py).
 */
import { request } from './request.js';

/**
 * The full summary. Walks the evaluations folder, so read it once and after a
 * change; poll getCleanStatus() for clean progress instead.
 * `archiveNotice` is what the next start archives while the first-start
 * notice is pending, else null.
 * @returns {Promise<{bytes: number, runs: number, archived: number, projects: Object<string, {bytes: number, runs: number, archived: number}>, keepRuns: number|null, coldAfterDays: number|null, archiveAfterDays: number|null, autoCleanup: boolean, archiveNotice: {runs: number, pack: number, trim: number, bytes: number}|null, clean: {state: string, done: number, total: number, archived: number, bytesFreed: number}}>}
 */
export function getStorage() {
  return request('/storage');
}

/** @returns {Promise<{clean: {state: string, done: number, total: number, archived: number, packed: number, trimmed: number, bytesFreed: number}}>} */
export function getCleanStatus() {
  return request('/storage/clean');
}

/**
 * Saves the settings given; the others keep their saved values. `keepRuns` null keeps every run;
 * `archiveAfterDays` is the 1.14 age choice, stored for a later release.
 * @param {{keepRuns?: 5|10|25|null, coldAfterDays?: 91|183|365|null, archiveAfterDays?: 91|183|365|null, autoCleanup?: boolean}} settings
 * @returns {Promise<{keepRuns: number|null, coldAfterDays: number|null, archiveAfterDays: number|null, autoCleanup: boolean}>}
 */
export function putStorageSettings(settings) {
  return request('/storage/settings', { method: 'PUT', body: JSON.stringify(settings) });
}

/** @returns {Promise<{archive: number, pack: number, trim: number, frees: number}>} */
export function getCleanPreview() {
  return request('/storage/preview');
}

/** 202 with the clean snapshot; throws a 409 while a clean (STORAGE_BUSY), the score warm-up or a formula rescore runs. */
export function startClean() {
  return request('/storage/clean', { method: 'POST' });
}

/** Deletes every project's evaluations; a 409's `body.projects` names the projects with a run in flight. */
export function deleteAllEvaluations() {
  return request('/storage?confirm=true', { method: 'DELETE' });
}
