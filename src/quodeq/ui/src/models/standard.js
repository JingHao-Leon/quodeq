/**
 * Custom-standard id/name business rules -- id auto-tracks name until the
 * user manually diverges it.
 *
 * Extracted from StandardDetail.jsx's name-field handler. Deliberately NOT
 * unified with the other two slugify implementations in this codebase
 * (SidePaneWindow.jsx, violationFixPlanSpec.jsx) -- those slugify filenames,
 * a different domain with different edge cases.
 *
 * Also where a standard comes from, as the app writes it: its family and
 * edition, its version, its sources.
 */

import { t } from '../strings/index.js';

/** Slugify a standard's display name into an id-safe string. */
export function slugify(text) {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * True when the standard's id should keep tracking its (about-to-change)
 * name: it's a brand-new standard whose id still equals the slug of its
 * current name (the user hasn't manually diverged it), or it has no id yet.
 *
 * An existing standard's id is its storage key (the update is sent to
 * `/api/standards/<id>`), so it never follows a rename.
 */
export function shouldSyncIdFromName(standard, isNew) {
  if (!standard.id) return true;
  return Boolean(isNew) && standard.id === slugify(standard.name || '');
}

/**
 * Field updates a name-field edit should apply: always the new name, plus
 * a re-synced id when `shouldSyncIdFromName` says the id hasn't manually
 * diverged. Returns `{ name }` or `{ name, id }`.
 */
export function applyNameChange(standard, name, isNew) {
  const updates = { name };
  if (shouldSyncIdFromName(standard, isNew)) {
    updates.id = slugify(name);
  }
  return updates;
}

/** The families a standard belongs to. */
export const STANDARD_TYPES = { ISO: 'iso', WCAG: 'wcag', QUODEQ: 'quodeq', COMMUNITY: 'community', CUSTOM: 'custom' };

const FAMILY_LABEL_KEYS = {
  [STANDARD_TYPES.ISO]: 'standards.baseIso',
  [STANDARD_TYPES.WCAG]: 'standards.baseWcag',
  [STANDARD_TYPES.QUODEQ]: 'standards.baseQuodeq',
  [STANDARD_TYPES.COMMUNITY]: 'standards.baseCommunity',
  [STANDARD_TYPES.CUSTOM]: 'standards.baseCustom',
};

/** The kind of standard alone, as the Standards table's type column shows it: "iso", "wcag", "custom". */
export function standardTypeLabel(standard) {
  const key = FAMILY_LABEL_KEYS[standard?.type];
  return key ? t(key) : null;
}

/** The standard's family and, when it has one, its edition: "iso-25010", "wcag-2.2", "custom". */
export function standardBaseLabel(standard) {
  const key = FAMILY_LABEL_KEYS[standard?.type];
  if (!key) return null;
  return standard.subtype ? `${t(key)}-${standard.subtype}` : t(key);
}

// A standard's sources as their bodies write them; anything else (a person's name, a long citation) stays as written.
const SOURCE_NAMES = {
  iso25010: 'ISO 25010', cisq: 'CISQ', asvs: 'ASVS', wcag: 'WCAG', wcag22: 'WCAG 2.2', owasp: 'OWASP',
  cert: 'CERT', en301549: 'EN 301 549',
};
const SOURCE_SEPARATOR = /\s*,\s*/;
const SOURCE_JOIN = ', ';

/** "iso25010, cisq" -> "ISO 25010, CISQ". */
export function standardSourceNames(source) {
  return String(source || '').split(SOURCE_SEPARATOR).filter(Boolean)
    .map((s) => SOURCE_NAMES[s.toLowerCase()] || s).join(SOURCE_JOIN);
}

/**
 * Where a standard comes from, as the parts of a sub line: its family and
 * edition ("iso-25010"), its version ("v2023.11") and what it is based on
 * ("based on ISO 25010, CISQ"), each left out when unknown.
 * @param {?{type: string, subtype?: string, version?: string, source?: string}} info
 * @returns {string[]}
 */
export function standardOriginParts(info) {
  if (!info) return [];
  const sources = standardSourceNames(info.source);
  return [
    standardBaseLabel(info),
    info.version ? t('explorer.standardVersion', { version: info.version }) : null,
    sources ? t('explorer.standardSource', { source: sources }) : null,
  ].filter(Boolean);
}

const DATE_DASH = /-/g;
const ISO_DATE_LENGTH = 10;

/** "2026-10-14" -> "2026.10.14", the version format custom standards use. */
export function dottedDate(iso) {
  return String(iso || '').slice(0, ISO_DATE_LENGTH).replace(DATE_DASH, '.');
}

/** The sub line under a standard's name: a built-in's source bodies, or a custom standard's own source. */
export function standardSourceLine(standard) {
  const sources = Array.isArray(standard?.sources) ? standard.sources : [];
  if (sources.length > 0) return standardSourceNames(sources.join(','));
  return String(standard?.source || '');
}

/** Hover text for a custom standard's version: when it was created and last changed. */
export function standardVersionTitle(standard) {
  if (!standard?.createdAt || !standard?.updatedAt) return null;
  return t('standards.versionTitle', { created: dottedDate(standard.createdAt), updated: dottedDate(standard.updatedAt) });
}
