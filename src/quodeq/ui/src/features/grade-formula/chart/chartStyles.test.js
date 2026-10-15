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

test('chart text is legible once the 960-unit viewBox is scaled down', () => {
  assert.match(rule('.gf-chart text'), /font-size: 13px/);
});

test('hovering the cost or lift group enlarges the dots that move', () => {
  const selector = ['cost', 'lift'].flatMap((g) => [`.gf-chart--hl-${g} .gf-dot--up`, `.gf-chart--hl-${g} .gf-dot--down`]).join(', ');
  assert.match(rule(selector) ?? '', /r: 5\.5px/);
});

test('on a narrow screen the impact panel stacks above the chart', () => {
  const narrow = CSS.slice(CSS.indexOf('@media (max-width: 960px) { .gf-split'));
  assert.match(narrow.slice(0, narrow.indexOf('}\n') + 1), /\.gf-impact \{[^}]*order: -1/);
});
