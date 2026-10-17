import { anchorLayout, runLayout } from './timelapseLayout.js';
import { handlePackMessage } from './packLayout.js';

/** Message types the layout worker answers besides a plain pack. */
export const TIMELAPSE_MESSAGE = Object.freeze({ MODEL: 'timelapse-model', RUN: 'timelapse-run' });
const NO_MODEL = 'time-lapse model not loaded';

/**
 * The worker's time-lapse job, kept pure so tests run it without a Worker.
 * It holds the last model sent (one Map view plays at a time) and its anchor,
 * and answers run layouts for that model only.
 * @returns {function(object): ({id: number, xyr: Float32Array}|{id: number, error: string})}
 */
export function createTimelapseHandler() {
  let held = null;
  return function handle({ id, type, modelId, model, run }) {
    if (type === TIMELAPSE_MESSAGE.MODEL) {
      // The message id names the model: the client sends runs for it under that id.
      held = { modelId: id, model, anchor: anchorLayout(model) };
      return { id, xyr: held.anchor.slice() };
    }
    if (!held || held.modelId !== modelId) return { id, error: NO_MODEL };
    return { id, xyr: runLayout(held.model, run) };
  };
}

/**
 * The layout worker's whole job, kept pure like the time-lapse one: a plain
 * pack or a time-lapse message, answered with `{id, xyr}`, or `{id, error}`
 * when the job throws, so a failing job rejects only its own request and the
 * worker lives on.
 * @returns {function(object): ({id: number, xyr: Float32Array}|{id: number, error: string})}
 */
export function createLayoutHandler() {
  const timelapse = createTimelapseHandler();
  return (data) => {
    try {
      return data.type ? timelapse(data) : handlePackMessage(data);
    } catch (err) {
      return { id: data.id, error: String(err?.message || err) };
    }
  };
}
