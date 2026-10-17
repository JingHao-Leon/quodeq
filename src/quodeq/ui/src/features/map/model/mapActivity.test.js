import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeActivity, NO_ACTIVITY, filePathKey } from './mapActivity.js';

const PAYLOAD = {
  activitySource: 'git',
  days: ['2026-09-01', '2026-09-02'],
  fileNames: ['a.py', 'b.py', 'gone.py'],
  frames: [{ day: '2026-09-02', files: [[0, 2, 1, 3, 0, 1, 5, 1, 10], [1, 0, 0, 4, 0, 0, 0, 0, 0]] }],
};

test('the latest frame becomes edits by path', () => {
  const out = decodeActivity(PAYLOAD);
  assert.equal(out.source, 'git');
  assert.equal(out.editsByPath.get('a.py'), 5);
  assert.equal(out.editsByPath.get('b.py'), 0);
  assert.equal(out.editsByPath.has('gone.py'), false);
});

test('an empty or malformed payload is no activity', () => {
  assert.equal(decodeActivity({ activitySource: 'none', fileNames: [], frames: [] }), NO_ACTIVITY);
  assert.equal(decodeActivity(null), NO_ACTIVITY);
  assert.equal(decodeActivity({ frames: [{ files: [[7, 0, 0, 0, 0, 0, 1, 1, 0]] }], fileNames: [] }).editsByPath.size, 0);
});

test('Windows and dot-relative activity paths are keyed with forward slashes', () => {
  const out = decodeActivity({ ...PAYLOAD, fileNames: ['src\\a.py', './src/b.py', 'c.py'] });
  assert.equal(out.editsByPath.get('src/a.py'), 5);
  assert.equal(out.editsByPath.get('src/b.py'), 0);
});

test('a tree path and its report spellings share one key', () => {
  assert.equal(filePathKey('src\\sub\\a.py'), 'src/sub/a.py');
  assert.equal(filePathKey('./src/a.py'), 'src/a.py');
  assert.equal(filePathKey('src/a.py'), 'src/a.py');
});
