/**
 * Shared SVG building blocks for the diagram fences in this directory.
 *
 * Every diagram computes its own geometry and returns a `<figure class="fig">`
 * built by `figure()`. Colours come from the palette below, never from the
 * author: a fence names a tone word and this module turns it into ink.
 *
 * @module render/diagrams/svg
 */

import { SERIES, toneInk } from "../charts.js";

/** Escape text for an SVG text node or attribute. */
export const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Round to two decimals so the markup stays short and stable across runs. */
export const n = (v) => Math.round(v * 100) / 100;

/** Diagram palette. Glyphs stay white; colour is reserved for meaning. */
export const INK = {
  text: "#fff",
  fill: "#0b0b0b",
  box: "#2a2a27",     // node outline
  rule: "#55554f",    // cell dividers, wires, secondary outlines
  line: "#3a3a37",    // edges
  arrow: "#6f6f6a",   // arrowheads on neutral edges
  bright: "#cfcfca",  // dots and message arrows that must read on black
  faint: "#1e1e1c",   // lane baselines
  up: SERIES[7],      // values sent toward the root
  down: SERIES[0],    // values sent away from the root
  span: SERIES[3],    // critical path
};

/**
 * Tone words a diagram fence may use: the chart tones plus the eight series slots.
 * `""` means "no tone", so callers fall back to their own default.
 */
export const DIAGRAM_TONES = /** @type {const} */ ([
  "good", "warn", "bad", "flat", "span", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8",
]);

/** Resolve a tone word to a colour, or `otherwise` when it is empty or unknown. */
export function inkOf(tone, otherwise) {
  if (!tone) return otherwise;
  if (tone === "span") return INK.span;
  const m = /^c([1-8])$/.exec(tone);
  if (m) return SERIES[Number(m[1]) - 1];
  return toneInk(tone, otherwise);
}

// Marker ids are document-global, so every diagram mints fresh ones.
let seq = 0;

/** A fresh id prefix for one diagram's markers. */
export const nextId = (prefix = "d") => `${prefix}${++seq}`;

/**
 * Arrowhead markers keyed by colour, created on demand: call `id(color)` while
 * drawing, then put `defs()` at the start of the SVG body.
 */
export function markers(prefix = nextId("m")) {
  /** @type {Map<string, string>} */
  const made = new Map();
  return {
    id(color = INK.arrow) {
      if (!made.has(color)) made.set(color, `${prefix}-${made.size}`);
      return /** @type {string} */ (made.get(color));
    },
    defs() {
      if (!made.size) return "";
      return "<defs>" + [...made].map(([color, id]) =>
        `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
        `<path d="M0,1 L9,5 L0,9 z" fill="${color}"/></marker>`).join("") + "</defs>";
    },
  };
}

/**
 * A `<text>` element. `cls` is `node-label` (13px) or `edge-label` (11.5px);
 * `mono` switches to the code face; `anchor` overrides the centred default.
 * @param {number} x @param {number} y @param {unknown} t
 * @param {{ cls?: string, color?: string, mono?: boolean, size?: number, anchor?: "start" | "middle" | "end", weight?: number, halo?: boolean }} [o]
 */
export function text(x, y, t, o = {}) {
  const style = [
    o.color && o.color !== INK.text ? `fill:${o.color}` : "",
    o.mono ? "font-family:var(--mono)" : "",
    o.size ? `font-size:${o.size}px` : "",
    o.anchor ? `text-anchor:${o.anchor}` : "",
    o.weight ? `font-weight:${o.weight}` : "",
    o.halo === false ? "stroke:none" : "",
  ].filter(Boolean).join(";");
  return `<text x="${n(x)}" y="${n(y)}" class="${o.cls ?? "edge-label"}"${style ? ` style="${style}"` : ""}>${esc(t)}</text>`;
}

/**
 * A numbered step badge: a filled disc with the number in black. Used wherever a
 * diagram says "this happened in step k".
 */
export function badge(x, y, step, color) {
  return `<circle cx="${n(x)}" cy="${n(y)}" r="8.5" fill="${color}"/>` +
    text(x, y + 3.8, step, { color: "#000", size: 11, weight: 700, halo: false });
}

/**
 * Where a ray from the centre of a node leaves its outline. `kind` is `rect` for
 * boxes and anything box-like, `ellipse` for circles and ellipses.
 * @param {{ x: number, y: number, w: number, h: number }} p @param {"rect" | "ellipse"} kind
 * @returns {[number, number]}
 */
export function clip(p, ux, uy, kind) {
  const len = Math.hypot(ux, uy) || 1;
  ux /= len; uy /= len;
  const rx = p.w / 2, ry = p.h / 2;
  const t = kind === "rect"
    ? Math.min(rx / Math.abs(ux || 1e-9), ry / Math.abs(uy || 1e-9))
    : 1 / Math.sqrt((ux / rx) ** 2 + (uy / ry) ** 2);
  return [p.x + ux * t, p.y + uy * t];
}

/**
 * Open an SVG with a viewBox, drawn at 1.15x its layout units. The shell gives
 * charts a 520px minimum so labels stay legible on a phone (the page scrolls them
 * sideways). A diagram whose natural size is under that floor would only be blown
 * up past its set type size, so it drops the floor and sits centred at natural
 * size; `compact` drops it for any diagram, so small ones can share a row.
 * `scroll` keeps a wide diagram at its natural size (the page scrolls it sideways)
 * instead of shrinking it, for rows of text that are unreadable when scaled down.
 * @param {{ x: number, y: number, w: number, h: number }} box
 * @param {{ label: string, maxW?: number, compact?: boolean, scroll?: boolean }} o
 */
export function svgOpen(box, o) {
  const maxW = o.maxW ?? Math.round(box.w * 1.15);
  const compact = o.compact || maxW < 520;
  const minW = o.scroll && !o.compact && box.w > 520 ? `min-width:${Math.round(box.w)}px;` : "";
  return `<svg viewBox="${n(box.x)} ${n(box.y)} ${n(box.w)} ${n(box.h)}" width="100%" style="${minW}max-width:${maxW}px" ` +
    `class="chart diagram${compact ? " compact" : ""}" role="img" aria-label="${esc(o.label)}">`;
}

/** The figure every diagram returns: optional title, the scrolling SVG, optional note. */
export function figure(svg, title = "", note = "") {
  return `<figure class="fig">` +
    (title ? `<figcaption class="fig-title">${esc(title)}</figcaption>` : "") +
    `<div class="fig-scroll">${svg}</div>` +
    (note ? `<div class="fig-note">${esc(note)}</div>` : "") + `</figure>`;
}

/**
 * Bounding box of a set of rectangles, padded. Returns a viewBox-ready box.
 * @param {{ x0: number, y0: number, x1: number, y1: number }[]} rects
 */
export function bounds(rects, pad = 12) {
  // A loop, not Math.min(...rects): a spread hits the engine's argument limit on big diagrams.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    if (r.x0 < x0) x0 = r.x0;
    if (r.y0 < y0) y0 = r.y0;
    if (r.x1 > x1) x1 = r.x1;
    if (r.y1 > y1) y1 = r.y1;
  }
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}

/** Rough text width for layout. SVG cannot measure before render, so this is calibrated to the shell's fonts. */
export const textW = (t, size = 13, mono = false) => String(t).length * size * (mono ? 0.62 : 0.56);
