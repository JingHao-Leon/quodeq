import { vi } from 'vitest';

/** A 2D canvas context of spies, enough for the Map canvas renderers. */
export function fakeCanvasContext() {
  const fills = [];
  return {
    fills, rect: vi.fn(),
    clearRect: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(), arc: vi.fn(), fill: vi.fn((rule) => { fills.push({ rule }); }), stroke: vi.fn(),
    fillText: vi.fn(), setTransform: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), quadraticCurveTo: vi.fn(),
    // parseCSSColor paints one pixel and reads it back.
    fillRect: vi.fn(), getImageData: vi.fn(() => ({ data: [0, 0, 0, 0] })),
    fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, font: '', textAlign: '', textBaseline: '',
    shadowBlur: 0, shadowColor: '',
  };
}
