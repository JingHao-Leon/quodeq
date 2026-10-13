import { readMapPalette, MAP_PALETTE_TOKENS } from './mapPalette.js';

describe('readMapPalette', () => {
  it('reads every token through the parser and keeps the dark flag', () => {
    const style = { getPropertyValue: (name) => ` ${name} ` };
    const seen = [];
    const palette = readMapPalette(style, (css) => { seen.push(css); return { r: 1, g: 2, b: 3 }; }, true);
    expect(seen).toEqual(Object.values(MAP_PALETTE_TOKENS));
    expect(palette.dark).toBe(true);
    expect(palette.worse).toEqual({ r: 1, g: 2, b: 3 });
  });
});
