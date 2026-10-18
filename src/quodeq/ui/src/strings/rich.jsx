// Catalog strings that need inline <code> spans carry them as `backticks`,
// and emphasis as **double asterisks**, the same conventions translators
// already know from markdown. tRich() renders one such string into React
// nodes.
//
// Why not HTML in the catalog: t() returns a plain string and React escapes
// it, so "<code>x</code>" would render as literal angle brackets. Splitting a
// sentence into per-fragment keys instead would hand translators unassemblable
// pieces (see the impactBody keys in the standards sweep for that lesson).
// One key per sentence, with the code spans marked inline, keeps the sentence
// whole and the markup out of the translator's way.
import { Fragment } from 'react';
import { t } from './index.js';

// Bold is tried first at each position, so a backtick inside **...** stays
// literal (e.g. **Ctrl+`**).
const RICH_SPAN = /\*\*([^*]+)\*\*|`([^`]+)`/g;

/** Render one already-translated string's inline markup into React nodes. */
export function renderRich(text) {
  const nodes = [];
  let last = 0;
  let match;
  RICH_SPAN.lastIndex = 0;
  while ((match = RICH_SPAN.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    nodes.push(match[1] !== undefined
      ? <strong key={match.index}>{match[1]}</strong>
      : <code key={match.index}>{match[2]}</code>);
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length === 0 ? text : <>{nodes}</>;
}

// Model-written prose (a finding's reason) marks code the markdown way: a
// run of backticks opens a span and the next run of the same length closes
// it, so ``a `b` c`` can hold a backtick. Only code is rendered here, not
// bold: a reason quoting "**MAJOR**" from source must stay as written. A run
// with no closer stays literal.
const BACKTICK_RUN = /`+/g;

function closingRun(text, from, length) {
  BACKTICK_RUN.lastIndex = from;
  let run;
  while ((run = BACKTICK_RUN.exec(text)) !== null) {
    if (run[0].length === length) return run;
  }
  return null;
}

/** Render a model-written string's `code` spans as amber chips. */
export function renderCodeSpans(text) {
  const nodes = [];
  let last = 0;
  let from = 0;
  for (;;) {
    BACKTICK_RUN.lastIndex = from;
    const open = BACKTICK_RUN.exec(text);
    if (open === null) break;
    const start = open.index + open[0].length;
    const close = closingRun(text, start, open[0].length);
    if (close === null) { from = start; continue; }
    let code = text.slice(start, close.index);
    if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ')) code = code.slice(1, -1);
    if (open.index > last) nodes.push(text.slice(last, open.index));
    nodes.push(<code key={open.index} className="code-chip">{code}</code>);
    last = from = close.index + close[0].length;
  }
  if (nodes.length === 0) return text;
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}

export function tRich(key, vars) {
  return renderRich(t(key, vars));
}

const SLOT = /\{(\w+)\}/g;

/**
 * One catalog sentence whose placeholders are React nodes (a link, a
 * coloured name), not strings: the sentence stays whole for translators,
 * and each {name} is swapped for slots[name]. A placeholder with no slot is
 * left as written, the same as t().
 */
export function tSlots(key, slots) {
  const template = t(key);
  const nodes = [];
  let last = 0;
  let match;
  SLOT.lastIndex = 0;
  while ((match = SLOT.exec(template)) !== null) {
    if (!Object.hasOwn(slots, match[1])) continue;
    if (match.index > last) nodes.push(template.slice(last, match.index));
    nodes.push(<Fragment key={match.index}>{slots[match[1]]}</Fragment>);
    last = match.index + match[0].length;
  }
  if (last < template.length) nodes.push(template.slice(last));
  return <>{nodes}</>;
}
