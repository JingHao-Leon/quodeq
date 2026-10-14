const isText = (x) => typeof x === 'string' && x.length > 0;

/** The `asOf` navigation param: a run to show the project as of, and its day; null when absent or malformed. */
export function readAsOf(param) {
  if (!param || typeof param !== 'object' || !isText(param.runId)) return null;
  return { runId: param.runId, day: isText(param.day) ? param.day : null };
}


