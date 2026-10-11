// Rehype plugin for help sections: two structural rewrites the markdown
// cannot express without leaving plain GFM (the website renders the same
// files with Python-Markdown, so the source must stay portable).
//
//   - a list whose every item opens with a term (`**Score** the number`, or
//     a `tag:critical` badge) becomes a <dl class="help-defs">, one dt/dd
//     pair per item, so the term reads as a label instead of a run-in;
//   - every h3 gets a slug id, which the "on this page" list links to.
//
// Lists with any item that does not open with a term are left untouched:
// half a definition list reads worse than a plain one.

const TAG_PREFIX = 'tag:';
// hast node types (the tree react-markdown hands to rehype plugins).
const HAST_TEXT = 'text';
const HAST_ELEMENT = 'element';
const DEFS_CLASS = 'help-defs';

function isBlank(node) {
  return node.type === HAST_TEXT && !node.value.trim();
}

function isElement(node, tagName) {
  return node?.type === HAST_ELEMENT && node.tagName === tagName;
}

function textOf(node) {
  if (node.type === HAST_TEXT) return node.value;
  return (node.children ?? []).map(textOf).join('');
}

function isTerm(node) {
  if (isElement(node, 'strong')) return true;
  return isElement(node, 'code') && textOf(node).startsWith(TAG_PREFIX);
}

// `**Term**: text` separates with a colon; `**Term**, text` is a sentence
// whose subject happens to be bold, and is no definition at all.
const SEPARATOR_RE = /^\s*:?\s*/;
const RUN_ON_RE = /^\s*,/;

/** Drop the space (and any colon) between the term and its definition. */
function trimLead(nodes) {
  const [first, ...rest] = nodes;
  if (first?.type !== HAST_TEXT) return nodes;
  const value = first.value.replace(SEPARATOR_RE, '');
  return value ? [{ ...first, value }, ...rest] : rest;
}

/**
 * Split an item into its term and the rest, or null when it does not open
 * with one. Tight items hold the inline run directly; loose items wrap it in
 * a <p>, with any further blocks (a nested list, a second paragraph) after.
 */
function splitItem(li) {
  const kids = li.children.filter((n) => !isBlank(n));
  const [head, ...blocks] = kids;
  const inline = isElement(head, 'p') ? head.children : kids;
  const after = isElement(head, 'p') ? blocks : [];
  const [term, ...rest] = inline;
  if (!term || !isTerm(term)) return null;
  if (rest[0]?.type === HAST_TEXT && RUN_ON_RE.test(rest[0].value)) return null;
  const definition = [...trimLead(rest), ...after];
  return definition.length > 0 ? { term, definition } : null;
}

function toDefinitionList(ul) {
  const items = ul.children.filter((n) => isElement(n, 'li'));
  if (items.length === 0) return false;
  const pairs = items.map(splitItem);
  if (pairs.some((p) => p === null)) return false;
  ul.tagName = 'dl';
  ul.properties = { className: [DEFS_CLASS] };
  ul.children = pairs.flatMap(({ term, definition }) => [
    { type: HAST_ELEMENT, tagName: 'dt', properties: {}, children: [term] },
    { type: HAST_ELEMENT, tagName: 'dd', properties: {}, children: definition },
  ]);
  return true;
}

export function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function walk(node, seen) {
  if (isElement(node, 'ul')) toDefinitionList(node);
  if (isElement(node, 'h3')) {
    const base = slugify(textOf(node)) || 'section';
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    node.properties = { ...node.properties, id: count === 1 ? base : `${base}-${count}` };
  }
  for (const child of node.children ?? []) walk(child, seen);
}

export default function rehypeHelpStructure() {
  return (tree) => walk(tree, new Map());
}
