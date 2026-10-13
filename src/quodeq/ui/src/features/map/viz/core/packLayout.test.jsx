import { describe, it, expect } from 'vitest';
import { buildPackRoot, packInPlace, slimTree, applyPositions, handlePackMessage, checksRun, PACK_BASE_SIZE } from './packLayout.js';

const FIXTURE = {
  name: '/', path: '', isFile: false, violations: 6, compliance: 2, severity: {},
  children: [
    { name: 'a', path: 'a', isFile: false, violations: 4, compliance: 1, severity: {}, children: [
      { name: 'a1.py', path: 'a/a1.py', isFile: true, violations: 3, compliance: 0, severity: {} },
      { name: 'a2.py', path: 'a/a2.py', isFile: true, violations: 1, compliance: 1, severity: {} },
    ] },
    { name: 'b.py', path: 'b.py', isFile: true, violations: 2, compliance: 1, severity: {} },
  ],
};

describe('pack layout: worker path matches the render-thread path', () => {
  it('positions every node identically', () => {
    const sync = packInPlace(buildPackRoot(FIXTURE));
    const viaWorker = buildPackRoot(FIXTURE);
    const { id, xyr } = handlePackMessage({ id: 7, slim: slimTree(viaWorker) });
    applyPositions(viaWorker, xyr);

    expect(id).toBe(7);
    const pos = (root) => root.descendants().map((n) => [n.data.path, n.x, n.y, n.r]);
    expect(pos(viaWorker)).toEqual(pos(sync));
  });

  it('slim trees carry no file data', () => {
    const slim = slimTree(buildPackRoot(FIXTURE));
    expect(JSON.stringify(slim)).not.toContain('a1.py');
    expect(Object.keys(slim).sort()).toEqual(['c', 'v']);
  });
});

describe('pack layout geometry', () => {
  it('centres the root with radius half the base size', () => {
    const root = packInPlace(buildPackRoot(FIXTURE));
    expect([root.x, root.y, root.r]).toEqual([PACK_BASE_SIZE / 2, PACK_BASE_SIZE / 2, PACK_BASE_SIZE / 2]);
  });

  it('sizes a file by its checks run', () => {
    const root = buildPackRoot(FIXTURE);
    const a2 = root.descendants().find((n) => n.data.path === 'a/a2.py');
    expect(a2.value).toBe(checksRun(a2.data));
  });

  it('counts at least one check for an empty file', () => {
    expect(checksRun({ violations: 0, compliance: 0 })).toBe(1);
  });
});
