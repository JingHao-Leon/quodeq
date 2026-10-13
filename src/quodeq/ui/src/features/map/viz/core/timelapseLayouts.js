import { anchorLayout, runLayout } from './timelapseLayout.js';
import { requestTimelapseModel, requestTimelapseRun } from './packWorkerClient.js';

/** Run layouts kept per model (about 8 MB for a 6,000-node, 119-run history at the cap). */
export const RUN_LAYOUT_CACHE_SIZE = 64;

/** The part of a time-lapse model the layout reads (what crosses to the worker). */
export function layoutModelOf(model) {
  return { parent: model.parent, sizes: model.sizes, maxSize: model.maxSize };
}

/**
 * Anchor and run layouts of one model, computed in the layout worker when
 * there is one and on this thread otherwise (or when the worker fails or holds
 * another model). Every run is computed once while it stays in the cache;
 * promises never reject.
 * @returns {{anchor: function(): Promise<Float32Array>, run: function(number): Promise<Float32Array>}}
 */
export function createTimelapseLayouts(model) {
  const layoutModel = layoutModelOf(model);
  let local = null;
  const localAnchor = () => { local = local || anchorLayout(layoutModel); return local; };
  const runLocally = (k) => runLayout(layoutModel, localAnchor(), k);
  const viaWorker = requestTimelapseModel(model.id, layoutModel);
  const anchor = viaWorker ? viaWorker.catch(localAnchor) : Promise.resolve().then(localAnchor);
  const runs = new Map();
  const remember = (k, promise) => {
    runs.set(k, promise);
    if (runs.size > RUN_LAYOUT_CACHE_SIZE) runs.delete(runs.keys().next().value);
    return promise;
  };
  return {
    anchor: () => anchor,
    run(k) {
      const hit = runs.get(k);
      if (hit) return hit;
      const job = anchor.then(() => (local ? runLocally(k) : requestTimelapseRun(model.id, k) || runLocally(k)));
      return remember(k, job.catch(() => runLocally(k)));
    },
  };
}
