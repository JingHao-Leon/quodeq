// The paint of a time-lapse move (spec 2.5, Decision 6): colours and
// opacities blend from the run the move starts from to the target run over
// the move, with the same eased t as the positions. Colours are packed
// 0xRRGGBB numbers parsed once per move, so a frame only does arithmetic and
// writes into paint objects made once per move.

const CHANNEL_MAX = 255;
const RED_SHIFT = 16;
const GREEN_SHIFT = 8;
const RGB_DIGITS = /(\d+)\D+(\d+)\D+(\d+)/;
/** Distinct colours kept (each way, string and number) before a cache starts over. */
export const CSS_CACHE_SIZE = 4096;
const NO_COLOUR = 0;
const OPAQUE = 1;
// Per circle, four numbers of each kind: fill (or alpha) from, to; stroke (or stroke alpha) from, to.
const ENDS = 4;
const STROKE_FROM = 2;
const STROKE_TO = 3;

/** How a circle's paint changes over a move. */
const CHANGE = Object.freeze({ KEEP_TARGET: 0, BLEND: 1, ARRIVE: 2, LEAVE: 3 });

const packedOfCss = new Map();
const cssOfPacked = new Map();

const channel = (packed, shift) => (packed >> shift) & CHANNEL_MAX;
const pack = (r, g, b) => (r << RED_SHIFT) | (g << GREEN_SHIFT) | b;

/**
 * A CSS `rgb(r, g, b)` colour as one 0xRRGGBB number (each string parsed once).
 * @param {string} [css]
 * @returns {number}
 */
export function packCss(css) {
  if (!css) return NO_COLOUR;
  let packed = packedOfCss.get(css);
  if (packed === undefined) {
    const m = RGB_DIGITS.exec(css);
    packed = m ? pack(Number(m[1]), Number(m[2]), Number(m[3])) : NO_COLOUR;
    if (packedOfCss.size >= CSS_CACHE_SIZE) packedOfCss.clear();
    packedOfCss.set(css, packed);
  }
  return packed;
}

/**
 * The CSS text of a packed colour, remembered so most frames reuse strings.
 * @param {number} packed 0xRRGGBB
 * @returns {string}
 */
export function cssOf(packed) {
  let css = cssOfPacked.get(packed);
  if (css === undefined) {
    if (cssOfPacked.size >= CSS_CACHE_SIZE) cssOfPacked.clear();
    css = `rgb(${channel(packed, RED_SHIFT)}, ${channel(packed, GREEN_SHIFT)}, ${channel(packed, 0)})`;
    cssOfPacked.set(packed, css);
  }
  return css;
}

/**
 * Packed colour `a` to `b` at `t` (0..1), per channel, rounded.
 * @returns {number} 0xRRGGBB
 */
export function lerpPacked(a, b, t) {
  const mix = (shift) => Math.round(channel(a, shift) + (channel(b, shift) - channel(a, shift)) * t);
  return pack(mix(RED_SHIFT), mix(GREEN_SHIFT), mix(0));
}

const blends = (change) => change === CHANGE.BLEND || change === CHANGE.ARRIVE;
const isSolid = (p) => Boolean(p && !p.ghost);

function samePaint(a, b) {
  return a.fill === b.fill && a.alpha === b.alpha && a.stroke === b.stroke && a.strokeAlpha === b.strokeAlpha;
}

function changeOf(from, to) {
  if (isSolid(from) && !isSolid(to)) return CHANGE.LEAVE;
  if (!isSolid(to)) return CHANGE.KEEP_TARGET;
  if (!isSolid(from)) return CHANGE.ARRIVE;
  return samePaint(from, to) ? CHANGE.KEEP_TARGET : CHANGE.BLEND;
}

/**
 * A move's paint, ready to blend: per circle what changes, both ends' colours
 * as packed numbers and opacities, and one reused paint object per circle
 * that blends. A circle in both runs blends; one that arrives fades in with
 * its target colour; one that leaves keeps its old paint while it shrinks
 * (it is drawn dotted once the move settles); the rest show the target paint.
 * @param {object[]} fromPaint runPaint of the run the move starts from
 * @param {object[]} toPaint runPaint of the target run
 */
export function createPaintTween(fromPaint, toPaint) {
  const n = toPaint.length;
  const change = new Uint8Array(n);
  const colours = new Int32Array(n * ENDS);
  const alphas = new Float32Array(n * ENDS);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const from = fromPaint[i];
    const to = toPaint[i];
    change[i] = changeOf(from, to);
    if (!blends(change[i])) { out[i] = change[i] === CHANGE.LEAVE ? from : to; continue; }
    out[i] = { ...to };
    const start = change[i] === CHANGE.ARRIVE ? { ...to, alpha: 0, strokeAlpha: 0 } : from;
    colours.set([packCss(start.fill), packCss(to.fill), packCss(start.stroke), packCss(to.stroke)], i * ENDS);
    alphas.set([start.alpha, to.alpha, start.strokeAlpha, to.strokeAlpha].map((v) => v ?? OPAQUE), i * ENDS);
  }
  return { change, colours, alphas, out };
}

/**
 * The paint `t` (0..1, eased) of the way through a move, written into the
 * tween's own paint objects: no allocation per circle per frame.
 * @returns {object[]} one CirclePaint per history node (the same array every frame)
 */
export function paintTweenAt(tween, t) {
  const { change, colours: c, alphas: a, out } = tween;
  for (let i = 0; i < change.length; i++) {
    if (!blends(change[i])) continue;
    const o = i * ENDS;
    const s0 = o + STROKE_FROM;
    const s1 = o + STROKE_TO;
    const p = out[i];
    p.fill = c[o] === c[o + 1] ? p.fill : cssOf(lerpPacked(c[o], c[o + 1], t));
    p.stroke = c[s0] === c[s1] ? p.stroke : cssOf(lerpPacked(c[s0], c[s1], t));
    p.alpha = a[o] + (a[o + 1] - a[o]) * t;
    p.strokeAlpha = a[s0] + (a[s1] - a[s0]) * t;
  }
  return out;
}
