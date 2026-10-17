/**
 * Settings › Storage: the space evaluations take, the archive-after setting,
 * "clean now" and "delete all" (api/routes_storage.py).
 */
import { request } from './request.js';

/**
 * The full summary. Walks the evaluations folder, so read it once and after a
 * change; poll getCleanStatus() for clean progress instead.
 * @returns {Promise<{bytes: number, runs: number, archived: number, projects: Object<string, {bytes: number, runs: number, archived: number}>, archiveAfterDays: number|null, clean: {state: string, done: number, total: number, archived: number, bytesFreed: number}}>}
 */
export function getStorage() {
  return request('/storage');
}

/** @returns {Promise<{clean: {state: string, done: number, total: number, archived: number, bytesFreed: number}}>} */
export function getCleanStatus() {
  return request('/storage/clean');
}

/**
 * @param {{archiveAfterDays: 91|183|365|null}} settings
 * @returns {Promise<{archiveAfterDays: number|null}>}
 */
export function putStorageSettings({ archiveAfterDays }) {
  return request('/storage/settings', { method: 'PUT', body: JSON.stringify({ archiveAfterDays }) });
}

/** @returns {Promise<{archive: number, frees: number}>} */
export function getCleanPreview() {
  return request('/storage/preview');
}

/** 202 with the clean snapshot; throws a 409 (STORAGE_BUSY) while a clean or the score warm-up runs. */
export function startClean() {
  return request('/storage/clean', { method: 'POST' });
}

/** Deletes every project's evaluations; a 409's `body.projects` names the projects with a run in flight. */
export function deleteAllEvaluations() {
  return request('/storage?confirm=true', { method: 'DELETE' });
}
