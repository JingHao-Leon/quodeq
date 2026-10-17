import { vi } from 'vitest';

const CHAR_PX = 6;

/** A 2D canvas context of spies, enough for the Map canvas renderers. */
export function fakeCanvasContext() {
  const fills = [];
  return {
    fills, rect: vi.fn(),
    clearRect: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(), arc: vi.fn(), fill: vi.fn((rule) => { fills.push({ rule }); }), stroke: vi.fn(),
    // Six pixels per character: enough for label placement to measure boxes.
    fillText: vi.fn(), measureText: vi.fn((text) => ({ width: text.length * CHAR_PX })), setTransform: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })), setLineDash: vi.fn(), strokeText: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), quadraticCurveTo: vi.fn(),
    // parseCSSColor paints one pixel and reads it back.
    fillRect: vi.fn(), getImageData: vi.fn(() => ({ data: [0, 0, 0, 0] })),
    fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, font: '', textAlign: '', textBaseline: '',
    shadowBlur: 0, shadowColor: '',
  };
}
