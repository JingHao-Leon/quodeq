// Test fixtures for the findings workbench model and components.
const v = (over) => ({
  title: 'Missing null guard', severity: 'major', file: 'src/a/x.py', line: 10,
  req: 'R-FT-2', practiceId: 'Fault Tolerance', detailDeferred: true, ...over,
});

export function makeDims() {
  return [
    { dimension: 'reliability', fromRunId: 'run-1', violations: [
      v({}),
      v({ title: 'Unchecked return', severity: 'minor', file: 'src/a/b/y.py', line: 3, req: 'R-FT-6' }),
      v({ title: 'Swallowed error', severity: 'critical', file: 'src/c/z.js', line: 7, req: 'R-FT-1' }),
    ] },
    { dimension: 'security', fromRunId: 'run-2', violations: [
      v({ title: 'Key logged', file: 'src/a/x.py', line: 40, req: 'S-CON-2', practiceId: 'Confidentiality' }),
      v({ title: 'No file at all', severity: 'minor', file: null, line: null, req: 'S-INT-1', practiceId: 'Integrity' }),
    ] },
  ];
}

export function makeDismissed() {
  return [{ title: 'Old warning', severity: 'minor', file: 'src/c/old.js', line: 2, req: 'M-ANA-1',
    principle: 'Analyzability', dimension: 'maintainability', reason: 'r', snippet: 's' }];
}
