import { vi } from 'vitest';
import { fakeCanvasContext } from './fakeCanvasContext.js';

function leaf(path, violations = 1) {
  return { path, name: path.split('/').at(-1), isFile: true, violations, compliance: 1, severity: { minor: violations } };
}

function folder(path, children) {
  const violations = children.reduce((s, c) => s + c.violations, 0);
  return { path, name: path.split('/').at(-1), isFile: false, violations, compliance: children.length, severity: {}, children };
}

/** A small map tree: src/{a.py, ui/b.js} and docs/c.md under the root. */
export function packTree() {
  const src = folder('src', [leaf('src/a.py'), folder('src/ui', [leaf('src/ui/b.js')])]);
  return folder('', [src, folder('docs', [leaf('docs/c.md')])]);
}

/** jsdom has no ResizeObserver; the pack's canvases observe their parent. */
export function stubResizeObserver() {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
}

/**
 * Stub what the two pack canvases need in jsdom: a ResizeObserver, a device
 * pixel ratio and a 2D context of spies. Returns the shared context.
 */
export function stubPackCanvas() {
  const ctx = fakeCanvasContext();
  stubResizeObserver();
  vi.stubGlobal('devicePixelRatio', 1);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  return ctx;
}
