// Positions in a map history file row (src/quodeq/api/map_history_payload.py):
// [file, weight, violations, compliance, critical, major, edits, ageFrom].
export const ROW = Object.freeze({ FILE: 0, WEIGHT: 1, VIOLATIONS: 2, COMPLIANCE: 3, CRITICAL: 4, MAJOR: 5, EDITS: 6, AGE_FROM: 7 });

/** How a payload's frames are encoded: every row each frame, or only the rows that changed. */
export const FRAME_ENCODING = Object.freeze({ FULL: 'full', DELTA: 'delta' });
