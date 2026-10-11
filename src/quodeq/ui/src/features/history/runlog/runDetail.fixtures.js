export const run = { runId: 'a', startedAt: '2026-10-11T00:45:04+00:00', score: 8.5, grade: 'Good', open: 398, critical: 0, majors: 96, dims: ['security'], partial: false,
  model: 'qwen', origin: { kind: 'ci', workflow: 'Quodeq Nightly', runUrl: 'https://x' }, commit: '6d62f65', activeSeconds: 12656, baselineKind: 'same-model', counts: { new: 1, resolved: 1, notReevaluated: 15 },
  dimensionDetails: [{ dimension: 'security', score: 8.4, grade: 'Good', majors: 26, critical: 0 }] };
export const baseline = { runId: 'b', startedAt: '2026-10-10T01:36:00+00:00', majors: 88, critical: 0, origin: { kind: 'ci', workflow: 'Quodeq Nightly' } };
export const diff = { new: [{ dimension: 'security', severity: 'major', title: 'Uncaught exception', principle: 'Fault Tolerance', file: 'a.py', line: 3 }],
  resolved: [{ dimension: 'security', severity: 'minor', title: 'Old', principle: 'P', file: 'b.py', line: 1 }], unchecked: 15,
  perDim: { security: { new: 1, resolved: 1, unchecked: 15 } }, newSev: { major: 1 }, resolvedSev: { minor: 1 } };
