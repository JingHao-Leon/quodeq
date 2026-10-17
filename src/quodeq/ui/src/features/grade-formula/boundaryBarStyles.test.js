// The grade bar's narrow-segment rule in base.css, read as text: jsdom does
// not apply container queries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../../styles/base.css', import.meta.url), 'utf8');

test('each grade segment is its own size container and clips its label', () => {
  const at = CSS.indexOf('.gf-boundary-seg {');
  const rule = CSS.slice(at, CSS.indexOf('}', at));
  assert.match(rule, /container-type: inline-size/);
  assert.match(rule, /overflow: hidden/);
});

test('a narrow segment swaps its name for the initial, keeping the name for screen readers', () => {
  const at = CSS.indexOf('@container (max-width: 64px)');
  const block = CSS.slice(at, CSS.indexOf('\n}\n', at));
  assert.match(block, /\.gf-boundary-seg__name \{[^}]*clip-path: inset\(50%\)/);
  assert.match(block, /\.gf-boundary-seg__initial \{ display: inline; \}/);
});
