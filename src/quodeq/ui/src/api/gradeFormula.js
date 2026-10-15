/**
 * Grade formula API — current/custom grade formula, preview against a run.
 */

import { request } from './request.js';

/** @returns {Promise<{current: Object, defaults: Object, isCustom: boolean, rescore: {state: string, generation: number, appliedGeneration: number, done: number, total: number, failed: number}}>} */
export function getGradeFormula() {
  return request('/grade-formula');
}

// PUT and DELETE answer 202: the rescore runs in the background; poll getGradeFormula for progress.
/** @returns {Promise<{current: Object, defaults: Object, isCustom: boolean, rescore: {state: string, generation: number, appliedGeneration: number, done: number, total: number, failed: number}}>} */
export function saveGradeFormula(params) {
  return request('/grade-formula', { method: 'PUT', body: JSON.stringify(params) });
}

/** @returns {Promise<{current: Object, defaults: Object, isCustom: boolean, rescore: {state: string, generation: number, appliedGeneration: number, done: number, total: number, failed: number}}>} */
export function resetGradeFormula() {
  return request('/grade-formula?confirm=true', { method: 'DELETE' });
}

/** Run the rescore pass again with the saved params (the retry after a failed pass). */
export function rescoreGradeFormula() {
  return request('/grade-formula/rescore', { method: 'POST' });
}

/** @returns {Promise<{projects: Array<{id: string, before: Object, after: Object}>, runsToRescore: number}>} */
export function previewGradeFormula(params) {
  return request('/grade-formula/preview', {
    method: 'POST',
    body: JSON.stringify({ params }),
  });
}

/**
 * Every local project's per-principle scoring inputs (read-only). No time
 * cap: a cold score cache makes this read outlast the 30 s client timeout.
 */
export function getGradeFormulaInputs() {
  return request('/grade-formula/inputs', { timeout: null });
}
