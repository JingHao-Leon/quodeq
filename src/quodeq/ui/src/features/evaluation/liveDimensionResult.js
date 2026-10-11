/**
 * A finished dimension's grade and score from its `dimension-completed`
 * frame (the dimension's evaluation/<dim>.json). Null until the frame
 * carries a score: a frame that failed to read sends only the name.
 * @param {object|undefined} payload
 * @returns {{score: number, grade: string|null}|null}
 */
export function parseDimensionResult(payload) {
  const score = parseFloat(payload?.overallScore);
  if (!Number.isFinite(score)) return null;
  return { score, grade: payload.overallGrade ?? null };
}
