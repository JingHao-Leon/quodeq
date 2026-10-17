// The chart and the split's layout rules in base.css, read as text: jsdom
// neither applies media queries nor knows SVG geometry properties like r.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../../../styles/base.css', import.meta.url), 'utf8');
const rule = (selector) => {
  const at = CSS.indexOf(`${selector} {`);
  return at < 0 ? null : CSS.slice(at, CSS.indexOf('}', at) + 1);
};

test('chart text keeps one pixel size whatever the viewBox is scaled to', () => {
  assert.match(rule('.gf-chart text'), /font-size: calc\(11px \* var\(--gf-k, 1\)\)/);
});

test('hovering the cost or lift group enlarges the dots that move', () => {
  const selector = ['cost', 'lift'].flatMap((g) => [`.gf-chart--hl-${g} .gf-dot--up:not(.gf-dot--flip)`, `.gf-chart--hl-${g} .gf-dot--down:not(.gf-dot--flip)`]).join(', ');
  assert.match(rule(selector) ?? '', /r: 5\.5px/);
});

// The stacked block: from its media query to the first line that closes it.
const stacked = () => {
  const from = CSS.indexOf('@media (max-width: 960px) {\n  .gf-split');
  return from < 0 ? '' : CSS.slice(from, CSS.indexOf('\n}\n', from));
};

test('on a narrow screen the impact panel stacks above the chart and stops pinning', () => {
  assert.match(stacked(), /\.gf-impact \{[^}]*position: static;[^}]*order: -1/);
});

test('the stacked block comes after the sticky impact rule, so it wins', () => {
  assert.ok(CSS.indexOf('@media (max-width: 960px) {\n  .gf-split') > CSS.indexOf('.gf-impact { position: sticky'));
});

test('a folded impact panel hides its body on a narrow screen', () => {
  assert.match(stacked(), /\.gf-impact--folded \.gf-impact__body \{ display: none; \}/);
});
