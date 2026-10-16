import test from 'node:test';
import assert from 'node:assert/strict';
import { standardTypeLabel, slugify, shouldSyncIdFromName, applyNameChange, standardSourceNames, standardOriginParts, STANDARD_TYPES, standardSourceLine, standardVersionTitle, dottedDate } from './standard.js';

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

test('slugify: lowercases, collapses non-alnum runs to a single dash', () => {
  assert.equal(slugify('Clean Architecture!'), 'clean-architecture');
});

test('slugify: trims leading/trailing dashes', () => {
  assert.equal(slugify('  --Foo Bar--  '), 'foo-bar');
});

// ---------------------------------------------------------------------------
// shouldSyncIdFromName
// ---------------------------------------------------------------------------

test('shouldSyncIdFromName: true for a brand-new standard', () => {
  assert.equal(shouldSyncIdFromName({ id: '', name: '' }, true), true);
});

test('shouldSyncIdFromName: true when there is no id yet', () => {
  assert.equal(shouldSyncIdFromName({ id: '', name: 'Foo' }, false), true);
});

// An existing standard's id is its storage key: the PUT goes to
// /api/standards/<id>, so re-syncing it on rename sends the update to an id
// that does not exist (404) and the rename is lost.
test('shouldSyncIdFromName: false for an existing standard even when the id equals the slug of its name', () => {
  assert.equal(shouldSyncIdFromName({ id: 'foo-bar', name: 'Foo Bar' }, false), false);
});

test('shouldSyncIdFromName: false once the id has manually diverged from the name slug', () => {
  assert.equal(shouldSyncIdFromName({ id: 'custom-id', name: 'Foo Bar' }, false), false);
});

// ---------------------------------------------------------------------------
// applyNameChange
// ---------------------------------------------------------------------------

test('applyNameChange: syncs id for a new standard', () => {
  assert.deepEqual(
    applyNameChange({ id: '', name: '' }, 'Security', true),
    { name: 'Security', id: 'security' },
  );
});

test('applyNameChange: does not include id once the user has diverged it', () => {
  const updates = applyNameChange({ id: 'custom-id', name: 'Old Name' }, 'New Name', false);
  assert.deepEqual(updates, { name: 'New Name' });
  assert.ok(!('id' in updates));
});

test('applyNameChange: renaming an existing standard keeps its id', () => {
  const updates = applyNameChange({ id: 'accessibility', name: 'Accessibility' }, 'Accessibility v2', false);
  assert.deepEqual(updates, { name: 'Accessibility v2' });
});

// ---------------------------------------------------------------------------
// where a standard comes from
// ---------------------------------------------------------------------------

test('standardSourceNames writes the bodies\' names and keeps anything else as written', () => {
  assert.equal(standardSourceNames('iso25010, cisq, asvs'), 'ISO 25010, CISQ, ASVS');
  assert.equal(standardSourceNames('Robert C. Martin'), 'Robert C. Martin');
  assert.equal(standardSourceNames(''), '');
});

test('standardOriginParts: family and edition, version, sources, each left out when unknown', () => {
  assert.deepEqual(
    standardOriginParts({ type: STANDARD_TYPES.ISO, subtype: '25010', version: '2023.11', source: 'iso25010, cisq' }),
    ['iso-25010', 'v2023.11', 'based on ISO 25010, CISQ'],
  );
  assert.deepEqual(standardOriginParts({ type: STANDARD_TYPES.QUODEQ, version: '', source: '' }), ['quodeq']);
  assert.deepEqual(standardOriginParts({ type: 'mystery' }), []);
  assert.deepEqual(standardOriginParts(null), []);
});

// ---------------------------------------------------------------------------
// Standards table: source line and version hover
// ---------------------------------------------------------------------------

test('standardSourceLine names a built-in by its sources, a custom one by its source', () => {
  assert.equal(standardSourceLine({ type: 'iso', sources: ['iso25010', 'cisq'], source: 'ISO/IEC 25010:2023' }), 'ISO 25010, CISQ');
  assert.equal(standardSourceLine({ type: 'iso', sources: [], source: 'ISO/IEC 25010:2023' }), 'ISO/IEC 25010:2023');
  assert.equal(standardSourceLine({ type: 'custom', source: 'Android Developers; Kotlin Documentation' }), 'Android Developers; Kotlin Documentation');
  assert.equal(standardSourceLine({ type: 'custom' }), '');
});

test('dottedDate writes an ISO date the way versions read', () => {
  assert.equal(dottedDate('2026-10-14'), '2026.10.14');
});

test('standardVersionTitle shows created and updated for custom standards only', () => {
  assert.equal(standardVersionTitle({ createdAt: '2026-10-14', updatedAt: '2026-10-15' }), 'created 2026.10.14 · updated 2026.10.15');
  assert.equal(standardVersionTitle({ version: '2023.11' }), null);
});

test('standardSourceLine names every source body the built-ins ship with', () => {
  assert.equal(standardSourceLine({ sources: ['iso25010', 'cisq', 'cert'] }), 'ISO 25010, CISQ, CERT');
  assert.equal(standardSourceLine({ sources: ['wcag22', 'en301549'] }), 'WCAG 2.2, EN 301 549');
});

test('standardTypeLabel names the kind only; the edition lives in the source line', () => {
  assert.equal(standardTypeLabel({ type: 'iso', subtype: '25010' }), 'iso');
  assert.equal(standardTypeLabel({ type: 'wcag', subtype: '2.2' }), 'wcag');
  assert.equal(standardTypeLabel({ type: 'custom' }), 'custom');
  assert.equal(standardTypeLabel({ type: 'unknown-kind' }), null);
});
