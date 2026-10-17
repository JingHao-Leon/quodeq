// The grade bar's narrow-segment rule in base.css, read as text: jsdom does
// not apply container queries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../../styles/base.css', import.meta.url), 'utf8');
// The text from `start` up to `end`, failing by name when the rule is gone.
const block = (start, end) => {
  const at = CSS.indexOf(start);
  assert.ok(at >= 0, `base.css has no ${start}`);
  return CSS.slice(at, CSS.indexOf(end, at));
};

test('each grade segment is its own size container and clips its label', () => {
  const rule = block('.gf-boundary-seg {', '}');
  assert.match(rule, /container-type: inline-size/);
  assert.match(rule, /overflow: hidden/);
});

test('a narrow segment swaps its name for the initial, keeping the name for screen readers', () => {
  const narrow = block('@container (max-width: 64px)', '\n}\n');
  assert.match(narrow, /\.gf-boundary-seg__name \{[^}]*clip-path: inset\(50%\)/);
  assert.match(narrow, /\.gf-boundary-seg__initial \{ display: inline; \}/);
});
