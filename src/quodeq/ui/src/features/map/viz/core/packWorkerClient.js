// One shared layout worker, created on first use. Returns null where
// workers do not exist (tests, old browsers) so callers fall back to the
// render thread.

import { TIMELAPSE_MESSAGE } from './timelapseWorker.js';

let worker = null;
let nextId = 0;
const pending = new Map();

function onMessage(event) {
  const { id, xyr, error } = event.data;
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  if (error) entry.reject(new Error(error));
  else entry.resolve(xyr);
}

// A crashed worker rejects every open request (callers fall back to the
// render thread) and is dropped so the next request starts a fresh one.
function onError(event) {
  console.warn('[packWorkerClient] layout worker failed', event?.message || event);
  for (const entry of pending.values()) entry.reject(new Error('layout worker failed'));
  pending.clear();
  worker?.terminate?.();
  worker = null;
}

function getWorker() {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./mapLayout.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = onMessage;
    worker.onerror = onError;
    return worker;
  } catch (err) {
    console.warn('[packWorkerClient] could not start layout worker', err);
    return null;
  }
}

/** Send one job to the shared worker; null when no worker is available. */
function post(message) {
  const w = getWorker();
  if (!w) return null;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ ...message, id });
  });
}

/** Pack a slim tree off the render thread. Resolves to `[x, y, r]` per node
 * in preorder, or null when no worker is available. */
export function requestPackLayout(slim) {
  return post({ slim });
}

/** Hand the worker a time-lapse model; resolves to its anchor layout, or null without a worker. */
export function requestTimelapseModel(modelId, model) {
  return post({ type: TIMELAPSE_MESSAGE.MODEL, modelId, model });
}

/** Run `run`'s layout for the model last handed over; rejects when the worker holds another model. */
export function requestTimelapseRun(modelId, run) {
  return post({ type: TIMELAPSE_MESSAGE.RUN, modelId, run });
}

/** Test seam: drop the shared worker so the next request creates a new one. */
export function resetPackWorker() {
  worker?.terminate?.();
  worker = null;
  pending.clear();
}
