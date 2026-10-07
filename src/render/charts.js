/**
 * Inline-SVG chart primitives.
 *
 * Every function returns a self-contained `<svg>` string: no script, no external
 * fetch, no CSS beyond the custom properties the shell already defines. Charts
 * are sized by viewBox and scale to their container, so they stay readable on a
 * phone. Hover text rides `<title>` elements, which browsers surface as native
 * tooltips without JavaScript.
 *
 * Geometry is computed here rather than eyeballed so bars, ticks and labels
 * always line up. Mark specs follow the dataviz skill: bars <= 24px with a 4px
 * rounded cap, 2px lines, >= 8px markers, 2px surface gaps, hairline gridlines.
 *
 * The class names below (`fig`, `fig-title`, `chart`, `tick`, `legend`, …) are
 * the contract with the shell's stylesheet; do not rename them here alone.
 *
 * @module render/charts
 */

/** @typedef {import("./ir.js").ChartBlock} ChartBlock */

/** The eight validated categorical slots, in order. */
export const SERIES = [
  "#3987e5", // 1 blue
  "#d95926", // 2 orange
  "#199e70", // 3 aqua
  "#c98500", // 4 yellow
  "#d55181", // 5 magenta
  "#008300", // 6 green
  "#9085e9", // 7 violet
  "#e66767", // 8 red
];

/** Semantic ink, shared with the shell's `--good` / `--critical`. */
const GOOD = "#0ca30c";
const BAD = "#d03b3b";

/**
 * The grammar's tone words (`good` `warn` `bad` `flat`) as ink. A document names
 * a tone, never a hex, so every renderer that paints one resolves it here.
 */
export const TONE_INK = { good: GOOD, warn: "#c98500", bad: BAD, flat: "#6f6f6a" };

/** Resolve a tone word to ink, falling back to `otherwise` when none is set. */
export const toneInk = (tone, otherwise) => TONE_INK[tone] ?? (tone || otherwise);

/** Mix a hex colour toward the surface. `t` = 0 is the surface, 1 is the colour. */
export function mix(hex, t, surface = "#0b0b0b") {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = rgb(surface), [r2, g2, b2] = rgb(hex);
  const c = (a, b) => Math.round(a + (b - a) * Math.max(0, Math.min(1, t)));
  return "#" + [c(r1, r2), c(g1, g2), c(b1, b2)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/**
 * Series colour by index, capped at the eight validated slots.
 * @throws {RangeError} past the eighth series.
 */
export function seriesColor(i) {
  if (i >= SERIES.length) throw new RangeError(`series ${i + 1} exceeds the 8-slot palette; fold the tail into "Other" or facet`);
  return SERIES[i];
}

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Round to 2dp so the emitted SVG stays small and diff-able. */
const n = (v) => Math.round(v * 100) / 100;

/**
 * Nice axis ticks: at most `count` round values covering [0, max].
 * Returns { top, ticks } where `top` is the scale ceiling.
 */
export function ticks(max, count = 4) {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] };
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  // A max too small for its tenth to be a normal double has no usable step: plot 0..max as is.
  if (!(step > 0)) return { top: max, ticks: [0, max] };
  // Count the steps rather than accumulating them: a fixed tolerance would dwarf a tiny step.
  const k = Math.max(1, Math.round(Math.ceil(max / step - 1e-9)));
  const out = [];
  for (let i = 0; i <= k; i++) out.push(n(i * step));
  return { top: k * step, ticks: out };
}

/** Compact number formatting: 1284 -> 1.3k, 4200000 -> 4.2M. */
export function compact(v, { prefix = "", suffix = "", dp = 1 } = {}) {
  const abs = Math.abs(v);
  const unit = abs >= 1e9 ? ["B", 1e9] : abs >= 1e6 ? ["M", 1e6] : abs >= 1e3 ? ["k", 1e3] : ["", 1];
  const scaled = v / unit[1];
  const text = unit[1] === 1 ? String(n(scaled)) : scaled.toFixed(scaled % 1 === 0 ? 0 : dp);
  return `${prefix}${text}${unit[0]}${suffix}`;
}

const group = (v, dp = 0) =>
  Number(v).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

/**
 * The `format` enum from the spec. A preset replaces the prototype's per-chart
 * formatter function: a document declares `"format":"ms"`, not a callback.
 *
 * - `int`     1284        -> `1,284`
 * - `compact` 4200000     -> `4.2M`
 * - `usd`     412000      -> `$412k`
 * - `pct`     0.031       -> `3.1%` (a fraction of one, not percentage points)
 * - `ms`      412         -> `412 ms`
 */
export const FORMATS = {
  // A fraction keeps two decimals so a 0.4 tick does not collapse to 0.
  int: (v) => (v !== 0 && Math.abs(v) < 1 ? group(v, 2) : group(Math.round(v))),
  compact: (v) => compact(v),
  usd: (v) => (v < 0 ? "-" : "") + compact(Math.abs(v), { prefix: "$" }),
  pct: (v) => `${Number((v * 100).toFixed(1))}%`,
  ms: (v) => `${group(Math.round(v))} ms`,
};

/**
 * A fixed number of decimals, for a heatmap's `decimals`: 0.05 beside 0.60
 * reads as a column, where a preset would print 0.05 beside 0.6. A value that
 * rounds to zero prints without a sign.
 */
export const fixed = (dp) => (v) => {
  const s = v.toFixed(dp);
  return Number(s) === 0 ? (0).toFixed(dp) : s;
};

/** Resolve a `format` enum value to a formatter; anything unknown falls back to `compact`. */
export function formatter(format) {
  return FORMATS[format] ?? FORMATS.compact;
}

// A small gutter on every side: end labels and dot rings sit right on the frame,
// and the scrolling wrapper clips anything painted outside the viewBox.
const svgOpen = (w, h, label) =>
  `<svg viewBox="-6 -4 ${w + 14} ${h + 8}" width="100%" role="img" aria-label="${esc(label)}" ` +
  `preserveAspectRatio="xMidYMid meet" class="chart">`;

/** `svgOpen` for a chart wider than the column: kept at its natural size, the figure scrolls sideways. */
const svgOpenScroll = (w, h, label) =>
  `<svg viewBox="-6 -4 ${w + 14} ${h + 8}" width="100%" style="min-width:${w + 14}px" role="img" aria-label="${esc(label)}" ` +
  `preserveAspectRatio="xMidYMid meet" class="chart">`;

/**
 * `svgOpen` for a chart narrower than the column (a square plot): drawn at its
 * own size and centred rather than stretched to the full width.
 */
const svgOpenSized = (w, h, label) =>
  `<svg viewBox="-6 -4 ${w + 14} ${h + 8}" width="100%" style="max-width:${w + 14}px;margin:0 auto" role="img" ` +
  `aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet" class="chart compact">`;

/**
 * Estimated width of a chart label: ~6.5px per character at 12px. Margins are
 * reserved from this rather than fixed, so a long value or category still
 * lands inside the viewBox.
 */
const textW = (s, px = 12) => String(s).length * 6.5 * (px / 12);
const widest = (xs, px = 12) => Math.max(0, ...xs.map((s) => textW(s, px)));

/**
 * Centre for a middle-anchored label, nudged so its estimated extent stays in
 * the viewBox (which spans -6 to w + 8; a couple of px are kept clear).
 */
const fitX = (x, s, w = 720) => {
  const half = textW(s) / 2;
  return Math.max(-4 + half, Math.min(w + 6 - half, x));
};

/** Left edge of a y-axis plot: room for the widest tick label, never under `min`. */
const axisX0 = (labels, min = 52) => Math.max(min, Math.ceil(widest(labels) + 10));

/** A category label under the x axis, kept inside the viewBox. */
const xTick = (x, y, s, w = 720) => `<text x="${n(fitX(x, s, w))}" y="${n(y)}" class="tick tick-x">${esc(s)}</text>`;

/**
 * Inline fill for a label that carries meaning (a delta, a drop, a toned end
 * label). Inline because the `.val` rule would beat a presentation attribute.
 * Only tone ink goes here: the dark steps, which all clear 3:1 on #000.
 */
const inkStyle = (hex) => (hex ? ` style="fill:${hex}"` : "");

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** #fff or #000, whichever contrasts more with a fill a label sits inside. */
export const inkOn = (hex) => ((luminance(hex) + 0.05) / 0.05 > 1.05 / (luminance(hex) + 0.05) ? "#000" : "#fff");

/** A bar with a rounded cap at the data end and square corners at the baseline. */
function cappedBar(x, y, w, h, r = 4) {
  const rr = Math.min(r, w / 2, h);
  if (h <= 0.5) return "";
  return `M${n(x)},${n(y + h)} L${n(x)},${n(y + rr)} Q${n(x)},${n(y)} ${n(x + rr)},${n(y)} ` +
    `L${n(x + w - rr)},${n(y)} Q${n(x + w)},${n(y)} ${n(x + w)},${n(y + rr)} L${n(x + w)},${n(y + h)} Z`;
}

function hBar(x, y, w, h, r = 4) {
  const rr = Math.min(r, h / 2, w);
  if (w <= 0.5) return "";
  return `M${n(x)},${n(y)} L${n(x + w - rr)},${n(y)} Q${n(x + w)},${n(y)} ${n(x + w)},${n(y + rr)} ` +
    `L${n(x + w)},${n(y + h - rr)} Q${n(x + w)},${n(y + h)} ${n(x + w - rr)},${n(y + h)} L${n(x)},${n(y + h)} Z`;
}

function gridAndAxis(g, top, tk, fmt) {
  const { x0, x1, y0, y1 } = g;
  const yOf = (v) => y1 - (v / top) * (y1 - y0);
  let out = "";
  for (const t of tk) {
    const y = yOf(t);
    out += `<line x1="${n(x0)}" y1="${n(y)}" x2="${n(x1)}" y2="${n(y)}" class="grid"/>`;
    out += `<text x="${n(x0 - 8)}" y="${n(y + 4)}" class="tick tick-y">${esc(fmt(t))}</text>`;
  }
  return out;
}

/** A dashed line key: the same 14px stroke, broken into 4px dashes. */
const dashKey = (color) => `repeating-linear-gradient(90deg,${color} 0 4px,transparent 4px 7px)`;

function legend(names, mark = "bar", colors = names.map((_, i) => seriesColor(i)), dashed = [], center = false) {
  const key = (i) => mark === "line"
    ? `<span class="stroke" style="background:${dashed[i] ? dashKey(colors[i]) : colors[i]}"></span>`
    : `<span class="swatch" style="background:${colors[i]}"></span>`;
  return `<div class="legend"${center ? ` style="justify-content:center"` : ""}>` + names.map((nm, i) =>
    `<span class="key">${key(i)}${esc(nm)}</span>`).join("") + `</div>`;
}

/** Figure wrapper: title above, legend under the title, note and caption below. */
function frame(svg, title, note, legendHtml = "") {
  return `<figure class="fig">` +
    (title ? `<figcaption class="fig-title">${esc(title)}</figcaption>` : "") +
    legendHtml +
    `<div class="fig-scroll">${svg}</div>` +
    (note ? `<div class="fig-note">${esc(note)}</div>` : "") +
    `</figure>`;
}

/**
 * Vertical columns over a categorical band.
 * rows: [{ label, value, tone? }]
 */
export function columns(rows, {
  title = "",
  note = "",
  format = (v) => compact(v),
  height = 220,
  color = SERIES[0],
  labelBars = true,
} = {}) {
  const W = 720, H = height;
  const max = Math.max(...rows.map((r) => r.value));
  const { top, ticks: tk } = ticks(max);
  const g = { x0: axisX0(tk.map(format)), x1: W - 12, y0: 16, y1: H - 34 };
  const yOf = (v) => g.y1 - (v / top) * (g.y1 - g.y0);
  const band = (g.x1 - g.x0) / rows.length;
  const bw = Math.min(24, band * 0.55);

  let body = gridAndAxis(g, top, tk, format);
  rows.forEach((r, i) => {
    const cx = g.x0 + band * (i + 0.5);
    const y = yOf(r.value);
    const fill = toneInk(r.tone, color);
    body += `<path d="${cappedBar(cx - bw / 2, y, bw, g.y1 - y)}" fill="${fill}">` +
      `<title>${esc(r.label)}: ${esc(format(r.value))}</title></path>`;
    if (labelBars) {
      body += `<text x="${n(fitX(cx, format(r.value)))}" y="${n(y - 7)}" class="val">${esc(format(r.value))}</text>`;
    }
    body += xTick(cx, g.y1 + 18, r.label);
  });
  body += `<line x1="${n(g.x0)}" y1="${n(g.y1)}" x2="${n(g.x1)}" y2="${n(g.y1)}" class="axis"/>`;
  return frame(svgOpen(W, H, title || "column chart") + body + "</svg>", title, note);
}

/** Horizontal ranking bars. rows: [{ label, value, tone? }] */
export function bars(rows, { title = "", note = "", format = (v) => compact(v), color = SERIES[0] } = {}) {
  const W = 720, rowH = 30, H = rows.length * rowH + 14;
  const labelW = Math.max(132, Math.ceil(widest(rows.map((r) => r.label)) + 14));
  const valW = widest(rows.map((r) => format(r.value)));
  const g = { x0: labelW, x1: W - Math.max(24, Math.ceil(valW + 10)), y0: 6, y1: H - 8 };
  const max = Math.max(...rows.map((r) => r.value));
  const { top } = ticks(max);
  let body = "";
  rows.forEach((r, i) => {
    const y = g.y0 + i * rowH;
    const w = ((r.value / top) * (g.x1 - g.x0)) || 0;
    body += `<text x="${n(labelW - 12)}" y="${n(y + 18)}" class="tick tick-y">${esc(r.label)}</text>`;
    body += `<path d="${hBar(g.x0, y + 5, w, 18)}" fill="${toneInk(r.tone, color)}">` +
      `<title>${esc(r.label)}: ${esc(format(r.value))}</title></path>`;
    body += `<text x="${n(g.x0 + w + 8)}" y="${n(y + 18)}" class="val val-left">${esc(format(r.value))}</text>`;
  });
  return frame(svgOpen(W, H, title || "bar chart") + body + "</svg>", title, note);
}

/** Grouped columns: rows [{ label, values: [..] }], series names in `names`. */
export function grouped(rows, names, { title = "", note = "", format = (v) => compact(v), height = 230 } = {}) {
  const W = 720, H = height;
  const max = Math.max(...rows.flatMap((r) => r.values));
  const { top, ticks: tk } = ticks(max);
  const g = { x0: axisX0(tk.map(format)), x1: W - 12, y0: 16, y1: H - 34 };
  const yOf = (v) => g.y1 - (v / top) * (g.y1 - g.y0);
  const band = (g.x1 - g.x0) / rows.length;
  const inner = Math.min(band * 0.7, 24 * names.length + 2 * (names.length - 1));
  const bw = (inner - 2 * (names.length - 1)) / names.length;

  let body = gridAndAxis(g, top, tk, format);
  rows.forEach((r, i) => {
    const start = g.x0 + band * (i + 0.5) - inner / 2;
    r.values.forEach((v, s) => {
      const x = start + s * (bw + 2);
      const y = yOf(v);
      body += `<path d="${cappedBar(x, y, bw, g.y1 - y)}" fill="${seriesColor(s)}">` +
        `<title>${esc(r.label)} · ${esc(names[s])}: ${esc(format(v))}</title></path>`;
    });
    body += xTick(g.x0 + band * (i + 0.5), g.y1 + 18, r.label);
  });
  body += `<line x1="${n(g.x0)}" y1="${n(g.y1)}" x2="${n(g.x1)}" y2="${n(g.y1)}" class="axis"/>`;
  return frame(svgOpen(W, H, title || "grouped bars") + body + "</svg>", title, note, legend(names));
}

/**
 * Stacked columns, 2px surface gap between segments.
 * rows: [{ label, values: [..] }]
 */
export function stacked(rows, names, { title = "", note = "", format = (v) => compact(v), height = 230 } = {}) {
  const W = 720, H = height;
  const max = Math.max(...rows.map((r) => r.values.reduce((a, b) => a + b, 0)));
  const { top, ticks: tk } = ticks(max);
  const g = { x0: axisX0(tk.map(format)), x1: W - 12, y0: 16, y1: H - 34 };
  const scale = (v) => (v / top) * (g.y1 - g.y0);
  const band = (g.x1 - g.x0) / rows.length;
  const bw = Math.min(24, band * 0.55);

  let body = gridAndAxis(g, top, tk, format);
  rows.forEach((r, i) => {
    const cx = g.x0 + band * (i + 0.5);
    let cursor = g.y1;
    r.values.forEach((v, s) => {
      const h = Math.max(0, scale(v) - 2); // 2px surface gap between segments
      const y = cursor - h;
      const isTop = s === r.values.length - 1;
      body += `<path d="${isTop ? cappedBar(cx - bw / 2, y, bw, h) : `M${n(cx - bw / 2)},${n(y)} h${n(bw)} v${n(h)} h${n(-bw)} Z`}" fill="${seriesColor(s)}">` +
        `<title>${esc(r.label)} · ${esc(names[s])}: ${esc(format(v))}</title></path>`;
      cursor = y - 2;
    });
    body += xTick(cx, g.y1 + 18, r.label);
  });
  body += `<line x1="${n(g.x0)}" y1="${n(g.y1)}" x2="${n(g.x1)}" y2="${n(g.y1)}" class="axis"/>`;
  return frame(svgOpen(W, H, title || "stacked bars") + body + "</svg>", title, note, legend(names));
}

/** The base of an axis scale name (`linear` `log2` `log10`), or 0 for linear. */
const baseOf = (scale) => (scale === "log2" ? 2 : scale === "log10" ? 10 : 0);

/**
 * A log axis covering [lo, hi] (both > 0). The domain snaps out to whole
 * powers of `base` and a tick sits on each power, thinned to at most `max`
 * so a wide log2 range does not crowd its labels.
 */
export function logTicks(lo, hi, base, max = 9) {
  const L = Math.log(base);
  const e0 = Math.floor(Math.log(lo) / L + 1e-9);
  let e1 = Math.max(e0 + 1, Math.ceil(Math.log(hi) / L - 1e-9));
  const every = Math.ceil((e1 - e0 + 1) / max);
  e1 = e0 + Math.ceil((e1 - e0) / every) * every;
  const out = [];
  for (let e = e0; e <= e1; e += every) out.push(base ** e);
  return { lo: base ** e0, hi: base ** e1, ticks: out };
}

/**
 * Tick text on a log axis. Powers of the base below one would round to "0"
 * under most presets, so they print as the plain number.
 */
const logLabel = (v, fmt) => (v >= 1 ? fmt(v) : String(Number(v.toPrecision(6))));

/** Smallest and largest of `vs`, by loop: a spread into Math.min hits the argument limit on long series. */
function extent(vs) {
  let lo = Infinity, hi = -Infinity;
  for (const v of vs) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return [lo, hi];
}

/**
 * Round linear ticks over [lo, hi] at the data's own precision, unlike `ticks()`,
 * which rounds to two decimals for the business-number charts. At most ~6 ticks.
 * @returns {{ min: number, top: number, ticks: number[], step: number }}
 */
function linearTicks(lo, hi, zero) {
  const niceStep = (span) => {
    const raw = span / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  };
  const step0 = niceStep(hi - lo || Math.abs(hi) || 1);
  // A negative low point still rounds down to a whole step, so the ticks read -2 / 0 / 2.
  const min = zero ? Math.min(0, Math.floor(lo / step0) * step0) : Math.floor(lo / step0) * step0;
  const step = niceStep(hi - min || step0);
  const count = Math.max(1, Math.ceil((hi - min) / step - 1e-9));
  const ticks = Array.from({ length: count + 1 }, (_, i) => Number((min + i * step).toPrecision(12)));
  return { min, top: count * step, ticks, step };
}

/**
 * Round ticks fitted to [lo, hi] in one pass, about five steps and no zero
 * floor: for a cloud of points with no natural origin.
 * @returns {{ min: number, top: number, ticks: number[], step: number }}
 */
function fitTicks(lo, hi) {
  const raw = (hi - lo || Math.abs(hi) || 1) / 5, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const min = Math.floor(lo / step) * step;
  const count = Math.max(1, Math.ceil((hi - min) / step - 1e-9));
  const ticks = Array.from({ length: count + 1 }, (_, i) => Number((min + i * step).toPrecision(12)));
  return { min, top: count * step, ticks, step };
}

/**
 * A numeric axis mapped onto [p0, p1] pixels: a log axis on powers of its
 * base, or a linear one on round steps (starting at zero when `zero` is set).
 * @returns {{ at: (v: number) => number, ticks: number[], label: (v: number) => string }}
 */
function numericAxis(values, scale, p0, p1, fmt, zero) {
  const base = baseOf(scale);
  const [lo, hi] = extent(values);
  if (base) {
    const t = logTicks(lo, hi, base);
    const span = Math.log(t.hi) - Math.log(t.lo);
    return { at: (v) => p0 + ((Math.log(v) - Math.log(t.lo)) / span) * (p1 - p0), ticks: t.ticks, label: (v) => logLabel(v, fmt) };
  }
  const t = linearTicks(lo, hi, zero);
  // Steps under 0.01 would print as "0" through the presets, so they print as the plain number.
  const label = t.step < 0.01 ? (v) => String(Number(v.toPrecision(6))) : fmt;
  return { at: (v) => p0 + ((v - t.min) / t.top) * (p1 - p0), ticks: t.ticks, label };
}

/** Reference lines are the flat tone, so a ref never reads as a series. */
const REF_INK = TONE_INK.flat;

/** Does the segment (ax, ay) to (bx, by) touch the box [x0, y0, x1, y1]? Liang-Barsky clipping. */
function segHits(box, ax, ay, bx, by) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  for (const [p, q] of [[-dx, ax - box[0]], [dx, box[2] - ax], [-dy, ay - box[1]], [dy, box[3] - ay]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}

/**
 * The first label candidate that touches no segment and no placed label, else
 * the one touching fewest. A candidate outside [minX, maxX] always loses.
 * @param {{ x: number, y: number, anchor: string, box: number[] }[]} cands
 * @param {number[][]} segs obstacles as [ax, ay, bx, by]
 * @param {number[][]} boxes labels placed so far; the winner is appended
 */
function placeLabel(cands, segs, boxes, minX, maxX) {
  let best = cands[0], bestHits = Infinity;
  for (const c of cands) {
    const [x0, y0, x1, y1] = c.box;
    let hits = x0 < minX || x1 > maxX ? 1e9 : 0;
    for (const s of segs) if (segHits(c.box, s[0], s[1], s[2], s[3])) hits++;
    for (const b of boxes) if (b[0] < x1 && x0 < b[2] && b[1] < y1 && y0 < b[3]) hits++;
    if (hits < bestHits) { best = c; bestHits = hits; if (!hits) break; }
  }
  boxes.push(best.box);
  return best;
}

/** A label candidate whose text starts (or ends, for `end`) at x with its baseline at y. */
const cand = (x, y, anchor, s) => {
  const w = textW(s);
  return { x, y, anchor, box: anchor === "end" ? [x - w, y - 11, x, y + 3] : [x, y - 11, x + w, y + 3] };
};

/**
 * Dashed reference lines over a plot, split into the lines (drawn under the
 * series) and their labels (drawn on top, placed clear of `segs`).
 * `xAt` is null on a categorical x axis, where only y refs exist; `dom` is the
 * plotted range of each axis, which the diagonal spans.
 *
 * @param {(string | { x?: number, y?: number, label?: string })[]} refs
 * @param {{ x0: number, x1: number, y0: number, y1: number }} g
 * @param {((v: number) => number) | null} xAt
 * @param {(v: number) => number} yAt
 * @param {{ x: number[] | null, y: number[] }} dom
 * @param {number[][]} segs the series, as pixel segments
 */
function refLines(refs, g, xAt, yAt, dom, segs) {
  const dash = ([x1, y1, x2, y2]) =>
    `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${REF_INK}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  /** @type {{ seg: number[], ref: { x?: number, y?: number, label?: string } | null }[]} */
  const drawn = [];
  for (const r of refs) {
    if (r === "diagonal") {
      if (!xAt || !dom.x) continue;
      const t0 = Math.max(dom.x[0], dom.y[0]), t1 = Math.min(dom.x[1], dom.y[1]);
      if (t1 > t0) drawn.push({ seg: [xAt(t0), yAt(t0), xAt(t1), yAt(t1)], ref: null });
    } else if (typeof r === "object" && r.y !== undefined) {
      drawn.push({ seg: [g.x0, yAt(r.y), g.x1, yAt(r.y)], ref: r });
    } else if (typeof r === "object" && r.x !== undefined && xAt) {
      drawn.push({ seg: [xAt(r.x), g.y0, xAt(r.x), g.y1], ref: r });
    }
  }
  const obstacles = segs.concat(drawn.map((d) => d.seg));
  /** @type {number[][]} */ const boxes = [];
  let labels = "";
  for (const { seg, ref } of drawn) {
    if (!ref?.label) continue;
    const s = ref.label;
    const cands = ref.y !== undefined
      ? [cand(g.x1 - 4, seg[1] - 5, "end", s), cand(g.x0 + 6, seg[1] - 5, "start", s),
        cand(g.x1 - 4, seg[1] + 15, "end", s), cand(g.x0 + 6, seg[1] + 15, "start", s)]
      : [cand(seg[0] + 5, g.y0 + 12, "start", s), cand(seg[0] + 5, g.y1 - 6, "start", s),
        cand(seg[0] - 5, g.y0 + 12, "end", s), cand(seg[0] - 5, g.y1 - 6, "end", s)];
    const c = placeLabel(cands, obstacles, boxes, g.x0 - 2, g.x1 + 2);
    labels += `<text x="${n(c.x)}" y="${n(c.y)}" class="tick" text-anchor="${c.anchor}">${esc(s)}</text>`;
  }
  return { lines: drawn.map((d) => dash(d.seg)).join(""), labels };
}

/** A rotated y-axis title at the left edge and a centred x-axis title at `xY`. */
function axisTitles(g, xY, xTitle, yTitle) {
  let out = "";
  if (xTitle) out += xTick((g.x0 + g.x1) / 2, xY, xTitle);
  if (yTitle) out += `<text transform="translate(14,${n((g.y0 + g.y1) / 2)}) rotate(-90)" class="tick" text-anchor="middle">${esc(yTitle)}</text>`;
  return out;
}

/** Left edge of the plot: room for the tick labels, plus a rotated title when there is one. */
const plotX0 = (tickLabels, yTitle) => (yTitle ? Math.max(58, Math.ceil(widest(tickLabels) + 32)) : axisX0(tickLabels));

/**
 * Lines over a shared x. series: [{ name, values: [..], tone?, dashed? }], x labels in `labels`.
 * The last point of each line is dotted and end-labelled. A series `tone`
 * (`good` `bad` `warn` `flat`) colours its line, key and end label; without
 * one the line takes its palette slot and the end label stays white. A
 * `dashed` series is a reference line (ideal speedup, a budget).
 *
 * `x` swaps the evenly spaced categories for numeric positions; `xScale` and
 * `yScale` put either axis on a log2 or log10 scale (a log x needs `x`).
 *
 * Series may instead carry `points: [[x, y], ...]`, each on its own x (ROC
 * curves, train and val logged at different epochs). Those share one numeric
 * x axis, are named in a legend rather than end-labelled, and fit the y axis
 * to the data's own precision.
 *
 * `refs` adds dashed reference lines (`"diagonal"`, `{ y }`, `{ x }`, each
 * optionally labelled), `xTitle` / `yTitle` name the axes, and `square` makes
 * the plot as wide as it is tall.
 */
export function lines(labels, series, {
  title = "",
  note = "",
  format = (v) => compact(v),
  height = 240,
  area = false,
  zeroFloor = true,
  x = /** @type {number[] | null} */ (null),
  xScale = "linear",
  yScale = "linear",
  refs = /** @type {(string | { x?: number, y?: number, label?: string })[]} */ ([]),
  xTitle = "",
  yTitle = "",
  square = false,
} = {}) {
  const xy = series.length > 0 && series.every((s) => Array.isArray(s.points));
  const refVals = (axis) => refs.flatMap((r) => (typeof r === "object" && Number.isFinite(r[axis]) ? [r[axis]] : []));
  const xRefs = refVals("x"), yRefs = refVals("y");
  const H = height + (xTitle ? 18 : 0);
  /** @type {number[]} */ const all = [];
  for (const s of series) for (const v of xy ? s.points.map((p) => p[1]) : s.values) all.push(v);
  for (const v of yRefs) all.push(v);
  const g = { x0: 0, x1: 0, y0: 16, y1: height - 34 };
  /** @type {{ v: number, label: string }[]} */ let yTicks;
  /** @type {(v: number) => number} */ let yOf;
  if (baseOf(yScale) || xy) {
    const axis = numericAxis(all, yScale, g.y1, g.y0, format, zeroFloor);
    yTicks = axis.ticks.map((v) => ({ v, label: axis.label(v) }));
    yOf = axis.at;
  } else {
    const [lo, max] = extent(all);
    // With no zero floor, drop the baseline to a round number below the low point
    // so the axis reads 250 / 300 / 350 rather than 284 / 334 / 384.
    const step0 = ticks(max - lo).ticks[1] || 1;
    // A zero floor holds only while nothing (a value or a reference) dips below zero.
    const min = zeroFloor && lo >= 0 ? 0 : Math.floor(lo / step0) * step0;
    const { top, ticks: tk } = ticks(max - min);
    yTicks = tk.map((t) => ({ v: t + min, label: format(t + min) }));
    yOf = (v) => g.y1 - ((v - min) / top) * (g.y1 - g.y0);
  }
  // End labels sit 10px right of the last point, so the plot stops short by their width.
  const right = xy ? 16 : Math.ceil(widest(series.map((s) => format(s.values.at(-1) ?? 0))) + 14);
  g.x0 = plotX0(yTicks.map((t) => t.label), yTitle);
  let W = 720;
  if (square) {
    g.x1 = g.x0 + (g.y1 - g.y0);
    W = g.x1 + right;
  } else g.x1 = W - right;
  const colors = series.map((s, si) => TONE_INK[s.tone] ?? seriesColor(si));
  const count = x ? x.length : labels.length;
  /** @type {(i: number) => number} */ let xOf = (i) => g.x0 + (i / Math.max(1, count - 1)) * (g.x1 - g.x0);
  /** @type {{ at: (v: number) => number, ticks: number[], label: (v: number) => string } | null} */
  let xAxis = null;
  if (xy) {
    /** @type {number[]} */ const xs = [];
    for (const s of series) for (const p of s.points) xs.push(p[0]);
    xAxis = numericAxis(xs.concat(xRefs), xScale, g.x0, g.x1, (v) => compact(v), true);
  } else if (x) {
    xAxis = numericAxis(xRefs.length ? x.concat(xRefs) : x, xScale, g.x0, g.x1, (v) => compact(v), true);
    const at = xAxis.at;
    xOf = (i) => at(x[i]);
  }
  const pointLabel = (i) => labels[i] ?? (xAxis ? xAxis.label(/** @type {number[]} */ (x)[i]) : "");

  let body = "";
  for (const t of yTicks) {
    const y = yOf(t.v);
    body += `<line x1="${n(g.x0)}" y1="${n(y)}" x2="${n(g.x1)}" y2="${n(y)}" class="grid"/>`;
    body += `<text x="${n(g.x0 - 8)}" y="${n(y + 4)}" class="tick tick-y">${esc(t.label)}</text>`;
  }
  if (xAxis && baseOf(xScale)) {
    for (const t of xAxis.ticks) {
      body += `<line x1="${n(xAxis.at(t))}" y1="${n(g.y0)}" x2="${n(xAxis.at(t))}" y2="${n(g.y1)}" class="grid"/>`;
    }
  }
  /** Each series as [x, y] pixels, for drawing and for keeping ref labels off the lines. */
  const pixels = series.map((s) => xy
    ? s.points.map((p) => [/** @type {NonNullable<typeof xAxis>} */ (xAxis).at(p[0]), yOf(p[1])])
    : s.values.map((v, i) => [xOf(i), yOf(v)]));
  let refLabels = "";
  if (refs.length) {
    /** @type {number[][]} */ const segs = [];
    for (const ps of pixels) for (let i = 1; i < ps.length; i++) segs.push([ps[i - 1][0], ps[i - 1][1], ps[i][0], ps[i][1]]);
    const dom = { x: xAxis ? [xAxis.ticks[0], xAxis.ticks[xAxis.ticks.length - 1]] : null, y: [yTicks[0].v, yTicks[yTicks.length - 1].v] };
    const r = refLines(refs, g, xAxis ? xAxis.at : null, yOf, dom, segs);
    body += r.lines;
    refLabels = r.labels;
  }
  series.forEach((s, si) => {
    const color = colors[si];
    const ps = pixels[si];
    const d = ps.map(([px, py], i) => `${i ? "L" : "M"}${n(px)},${n(py)}`).join(" ");
    if (area && series.length === 1) {
      body += `<path d="${d} L${n(ps[ps.length - 1][0])},${n(g.y1)} L${n(ps[0][0])},${n(g.y1)} Z" fill="${color}" opacity="0.10"/>`;
    }
    const stroke = `fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"` +
      `${s.dashed ? ` stroke-dasharray="6 5"` : ""}`;
    if (xy) {
      // A long series would carry one hover target per point; the line names itself instead.
      body += `<path d="${d}" ${stroke}><title>${esc(s.name)}</title></path>`;
      return;
    }
    body += `<path d="${d}" ${stroke}/>`;
    s.values.forEach((v, i) => {
      body += `<circle cx="${n(xOf(i))}" cy="${n(yOf(v))}" r="9" fill="transparent">` +
        `<title>${esc(s.name)} · ${esc(pointLabel(i))}: ${esc(format(v))}</title></circle>`;
    });
    const li = s.values.length - 1;
    body += `<circle cx="${n(xOf(li))}" cy="${n(yOf(s.values[li]))}" r="4" fill="${color}" stroke="#000" stroke-width="2"/>`;
    body += `<text x="${n(xOf(li) + 10)}" y="${n(yOf(s.values[li]) + 4)}" class="val val-left"${inkStyle(TONE_INK[s.tone])}>` +
      `${esc(format(s.values[li]))}</text>`;
  });
  body += refLabels;
  if (xAxis) {
    for (const t of xAxis.ticks) body += xTick(xAxis.at(t), g.y1 + 18, xAxis.label(t));
  } else {
    labels.forEach((l, i) => {
      if (labels.length > 8 && i % 2) return;
      body += xTick(xOf(i), g.y1 + 18, l);
    });
  }
  body += `<line x1="${n(g.x0)}" y1="${n(g.y1)}" x2="${n(g.x1)}" y2="${n(g.y1)}" class="axis"/>`;
  body += axisTitles(g, g.y1 + 36, xTitle, yTitle);
  return frame(
    (square ? svgOpenSized : svgOpen)(W, H, title || "line chart") + body + "</svg>",
    title,
    note,
    xy || series.length > 1 ? legend(series.map((s) => s.name), "line", colors, series.map((s) => s.dashed === true), square) : "",
  );
}

/**
 * A 12-point sparkline sized for a table cell. Re-exported for WP3's stats and
 * hero tiles.
 * @throws {RangeError} on fewer than two points, which cannot make a line.
 */
export function sparkline(values, { color = SERIES[0], w = 108, h = 26 } = {}) {
  if (values.length < 2) throw new RangeError("a sparkline needs at least two points");
  const max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const xOf = (i) => 2 + (i / (values.length - 1)) * (w - 14);
  const yOf = (v) => h - 4 - ((v - min) / span) * (h - 10);
  const d = values.map((v, i) => `${i ? "L" : "M"}${n(xOf(i))},${n(yOf(v))}`).join(" ");
  const li = values.length - 1;
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="spark" aria-hidden="true">` +
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<circle cx="${n(xOf(li))}" cy="${n(yOf(values[li]))}" r="3" fill="${color}"/></svg>`;
}

/** Signed change bars about a zero line. rows: [{ label, value }] */
export function delta(rows, {
  title = "", note = "", format = (v) => (v > 0 ? "+" : "") + compact(v), height = 190,
  // Up is not always good. Latency and error counts want higherIsBetter: false.
  higherIsBetter = true,
} = {}) {
  const W = 720, H = height;
  const max = Math.max(...rows.map((r) => Math.abs(r.value)));
  const { top } = ticks(max, 2);
  const g = { x0: axisX0([format(top), format(-top)]), x1: W - 12, y0: 16, y1: H - 34 };
  const mid = (g.y0 + g.y1) / 2;
  const yOf = (v) => mid - (v / top) * ((g.y1 - g.y0) / 2);
  const band = (g.x1 - g.x0) / rows.length;
  const bw = Math.min(24, band * 0.55);

  let body = `<line x1="${n(g.x0)}" y1="${n(mid)}" x2="${n(g.x1)}" y2="${n(mid)}" class="axis"/>`;
  body += `<text x="${n(g.x0 - 8)}" y="${n(yOf(top) + 4)}" class="tick tick-y">${esc(format(top))}</text>`;
  body += `<text x="${n(g.x0 - 8)}" y="${n(yOf(-top) + 4)}" class="tick tick-y">${esc(format(-top))}</text>`;
  rows.forEach((r, i) => {
    const cx = g.x0 + band * (i + 0.5);
    const y = yOf(r.value);
    const h = Math.abs(mid - y);
    const up = r.value >= 0;
    const fill = up === higherIsBetter ? GOOD : BAD;
    const d = up
      ? cappedBar(cx - bw / 2, y, bw, h)
      : `M${n(cx - bw / 2)},${n(mid)} h${n(bw)} v${n(h - 4)} q0,4 -4,4 h${n(-(bw - 8))} q-4,0 -4,-4 Z`;
    body += `<path d="${d}" fill="${fill}"><title>${esc(r.label)}: ${esc(format(r.value))}</title></path>`;
    // The label takes the bar's tone, so good and bad read without the bar.
    body += `<text x="${n(fitX(cx, format(r.value)))}" y="${n(up ? y - 7 : y + 15)}" class="val"${inkStyle(fill)}>${esc(format(r.value))}</text>`;
    // Below the label of a bar that reaches the floor, which sits at y1 + 15.
    body += xTick(cx, g.y1 + 30, r.label);
  });
  return frame(svgOpen(W, H, title || "change chart") + body + "</svg>", title, note);
}

/**
 * Dot + whisker: a middle value with a low/high range per item.
 * rows: [{ label, mid, lo, hi }]
 */
export function whisker(rows, { title = "", note = "", format = (v) => compact(v) } = {}) {
  const W = 720, rowH = 32, H = rows.length * rowH + 30;
  const valW = widest(rows.map((r) => format(r.mid)));
  const g = {
    x0: Math.max(132, Math.ceil(widest(rows.map((r) => r.label)) + 14)),
    x1: W - Math.max(24, Math.ceil(valW + 10)), y0: 8, y1: H - 24,
  };
  const max = Math.max(...rows.map((r) => r.hi));
  const { top, ticks: tk } = ticks(max);
  const xOf = (v) => g.x0 + (v / top) * (g.x1 - g.x0);
  let body = "";
  for (const t of tk) {
    body += `<line x1="${n(xOf(t))}" y1="${n(g.y0)}" x2="${n(xOf(t))}" y2="${n(g.y1)}" class="grid"/>`;
    body += xTick(xOf(t), H - 6, format(t));
  }
  rows.forEach((r, i) => {
    const y = g.y0 + i * rowH + rowH / 2;
    body += `<text x="${n(g.x0 - 12)}" y="${n(y + 4)}" class="tick tick-y">${esc(r.label)}</text>`;
    body += `<line x1="${n(xOf(r.lo))}" y1="${n(y)}" x2="${n(xOf(r.hi))}" y2="${n(y)}" stroke="${SERIES[0]}" stroke-width="2" opacity="0.45"/>`;
    for (const edge of [r.lo, r.hi]) {
      body += `<line x1="${n(xOf(edge))}" y1="${n(y - 5)}" x2="${n(xOf(edge))}" y2="${n(y + 5)}" stroke="${SERIES[0]}" stroke-width="2" opacity="0.45"/>`;
    }
    body += `<circle cx="${n(xOf(r.mid))}" cy="${n(y)}" r="5" fill="${SERIES[0]}" stroke="#000" stroke-width="2">` +
      `<title>${esc(r.label)}: ${esc(format(r.mid))} (${esc(format(r.lo))}–${esc(format(r.hi))})</title></circle>`;
    body += `<text x="${n(g.x1 + 8)}" y="${n(y + 4)}" class="val val-left">${esc(format(r.mid))}</text>`;
  });
  return frame(svgOpen(W, H, title || "range chart") + body + "</svg>", title, note);
}

/**
 * Heat map. rowLabels: y categories, colLabels: x categories, values[y][x].
 * `emphasis: "diagonal"` outlines the cells where row = col (the correct
 * predictions of a confusion matrix), inset so the value stays clear of it.
 */
export function heatmap(rowLabels, colLabels, values, { title = "", note = "", format = (v) => String(v), emphasis = "" } = {}) {
  const cell = 34, gap = 2, W0 = 720;
  // Row labels may take at most 45% of the column, so a very long label cannot squeeze the cells.
  const labelW = Math.min(Math.round(W0 * 0.45), Math.max(96, Math.ceil(widest(rowLabels) + 14)));
  // A cell is never narrower than its widest printed value (six decimals included), so
  // neighbours never overlap; when the cells no longer fit, the chart widens and scrolls.
  const valueW = Math.ceil(widest(values.flat().map((v) => format(v)), 11) + 8);
  const cw = Math.max(6, valueW, Math.min(Math.max(cell, valueW), (W0 - labelW - 12) / colLabels.length - gap));
  const W = Math.max(W0, Math.ceil(labelW + colLabels.length * (cw + gap) + 12));
  const H = rowLabels.length * (cell + gap) + 34;
  const max = Math.max(...values.flat());
  let body = "";
  colLabels.forEach((c, x) => {
    body += xTick(labelW + x * (cw + gap) + cw / 2, 14, c, W);
  });
  rowLabels.forEach((r, y) => {
    const ty = 24 + y * (cell + gap);
    body += `<text x="${n(labelW - 12)}" y="${n(ty + cell / 2 + 4)}" class="tick tick-y">${esc(r)}</text>`;
    colLabels.forEach((c, x) => {
      const v = values[y]?.[x] ?? 0;
      const t = max ? v / max : 0;
      // One hue, light -> dark, stepped for a black surface.
      const fill = mix(SERIES[0], 0.12 + t * 0.88);
      body += `<rect x="${n(labelW + x * (cw + gap))}" y="${n(ty)}" width="${n(cw)}" height="${cell}" rx="3" fill="${fill}">` +
        `<title>${esc(r)} · ${esc(c)}: ${esc(format(v))}</title></rect>`;
      if (emphasis === "diagonal" && x === y) {
        body += `<rect x="${n(labelW + x * (cw + gap) + 1)}" y="${n(ty + 1)}" width="${n(Math.max(0, cw - 2))}" height="${cell - 2}" ` +
          `rx="2.5" fill="none" stroke="${GOOD}" stroke-width="2"/>`;
      }
      // Ink by the cell's luminance. Dark ink swaps the black halo for the cell
      // colour, which would otherwise thicken the glyphs.
      const ink = inkOn(fill);
      body += `<text x="${n(labelW + x * (cw + gap) + cw / 2)}" y="${n(ty + cell / 2 + 4)}" class="cell-val" ` +
        `fill="${ink}"${ink === "#000" ? ` style="stroke:${fill}"` : ""}>${esc(format(v))}</text>`;
    });
  });
  const open = W > W0 ? svgOpenScroll(W, H, title || "heat map") : svgOpen(W, H, title || "heat map");
  return frame(open + body + "</svg>", title, note);
}

/**
 * A horizontal progress meter, severity carried by the fill. Re-exported for
 * WP3's stat tiles.
 */
export function meter(value, { max = 1, tone = SERIES[0], label = "", right = "" } = {}) {
  const pct = Math.max(0, Math.min(1, value / max));
  return `<div class="meter">` +
    (label ? `<div class="meter-head"><span>${esc(label)}</span><span class="num">${esc(right)}</span></div>` : "") +
    `<div class="meter-track"><div class="meter-fill" style="width:${n(pct * 100)}%;background:${tone}"></div></div></div>`;
}

/**
 * Waterfall / bridge: signed steps between a start and an end total.
 * rows: [{ label, value, total? }]; a `total` row is drawn from zero.
 * Steps and their labels are green when they move the way `higherIsBetter`
 * wants, red otherwise; balances are blue with a white label.
 */
export function waterfall(rows, {
  title = "", note = "", format = (v) => compact(v), height = 230, higherIsBetter = true,
} = {}) {
  const W = 720, H = height;
  let run = 0;
  const spans = rows.map((r) => {
    if (r.total) { const s = { from: 0, to: r.value, ...r }; run = r.value; return s; }
    const from = run; run += r.value;
    return { from, to: run, ...r };
  });
  const max = Math.max(...spans.flatMap((s) => [s.from, s.to]));
  const { top, ticks: tk } = ticks(max);
  const g = { x0: axisX0(tk.map(format), 58), x1: W - 12, y0: 16, y1: H - 34 };
  const yOf = (v) => g.y1 - (v / top) * (g.y1 - g.y0);
  const band = (g.x1 - g.x0) / rows.length;
  const bw = Math.min(24, band * 0.6);

  let body = gridAndAxis(g, top, tk, format);
  spans.forEach((s, i) => {
    const cx = g.x0 + band * (i + 0.5);
    const yTop = yOf(Math.max(s.from, s.to));
    const h = Math.abs(yOf(s.from) - yOf(s.to));
    const tone = s.total ? "" : (s.value >= 0) === higherIsBetter ? GOOD : BAD;
    const fill = tone || SERIES[0];
    body += `<path d="${cappedBar(cx - bw / 2, yTop, bw, h)}" fill="${fill}">` +
      `<title>${esc(s.label)}: ${esc(format(s.value))}</title></path>`;
    if (i < spans.length - 1) {
      const y = yOf(s.to);
      body += `<line x1="${n(cx + bw / 2)}" y1="${n(y)}" x2="${n(cx + band - bw / 2)}" y2="${n(y)}" stroke="#3a3a37" stroke-width="1" stroke-dasharray="3 3"/>`;
    }
    body += `<text x="${n(fitX(cx, format(s.value)))}" y="${n(yTop - 7)}" class="val"${inkStyle(tone)}>${esc(format(s.value))}</text>`;
    body += xTick(cx, g.y1 + 18, s.label);
  });
  body += `<line x1="${n(g.x0)}" y1="${n(g.y1)}" x2="${n(g.x1)}" y2="${n(g.y1)}" class="axis"/>`;
  return frame(svgOpen(W, H, title || "waterfall") + body + "</svg>", title, note);
}

/**
 * Scatter, optionally sized. points: [{ x, y, size?, label? }].
 * Two numeric axes; the size channel is the bubble area.
 *
 * `series: [{ name, points: [[x, y], ...], tone? }]` replaces `points` with
 * coloured groups and a legend. `marks: [{ at: [x, y], label? }]` draws a
 * labelled cross at each point (a k-means centroid).
 */
export function scatter(points, {
  title = "", note = "", height = 280, xTitle = "", yTitle = "",
  fx = (v) => compact(v), fy = (v) => compact(v), color = SERIES[0],
  xScale = "linear", yScale = "linear",
  series = /** @type {{ name: string, points: [number, number][], tone?: string }[]} */ ([]),
  marks = /** @type {{ at: [number, number], label?: string }[]} */ ([]),
} = {}) {
  const W = 720, H = height;
  const g = { x0: 0, x1: W - 16, y0: 16, y1: H - 42 };
  // Linear axes start at zero; a log axis snaps to powers of its base.
  /** @param {number[]} vs @param {string} scale @param {(v: number) => string} f */
  const axisOf = (vs, scale, f) => {
    if (baseOf(scale)) {
      const t = logTicks(...extent(vs), baseOf(scale));
      const span = Math.log(t.hi) - Math.log(t.lo);
      return { ticks: t.ticks, frac: (v) => (Math.log(v) - Math.log(t.lo)) / span, label: (v) => logLabel(v, f) };
    }
    const { top, ticks: tk } = ticks(extent(vs)[1]);
    return { ticks: tk, frac: (v) => v / top, label: f };
  };
  /** @type {number[]} */ const xv = [], yv = [];
  if (series.length) {
    for (const s of series) for (const p of s.points) { xv.push(p[0]); yv.push(p[1]); }
  } else {
    for (const p of points) { xv.push(p.x); yv.push(p.y); }
  }
  for (const m of marks) { xv.push(m.at[0]); yv.push(m.at[1]); }
  // Groups (an embedding, a feature space) have no natural zero, so their axes fit the cloud.
  /** @param {number[]} vs @param {string} scale @param {(v: number) => string} f */
  const groupAxis = (vs, scale, f) => {
    if (baseOf(scale)) return axisOf(vs, scale, f);
    const t = fitTicks(...extent(vs));
    return { ticks: t.ticks, frac: (v) => (v - t.min) / t.top, label: t.step < 0.01 ? (v) => String(Number(v.toPrecision(6))) : f };
  };
  const xa = (series.length ? groupAxis : axisOf)(xv, xScale, fx);
  const ya = (series.length ? groupAxis : axisOf)(yv, yScale, fy);
  // A y title stands at x = 14, rotated; the tick labels keep clear of it.
  g.x0 = Math.max(58, Math.ceil(widest(ya.ticks.map(ya.label)) + 10 + (yTitle ? 22 : 0)));
  const maxSize = Math.max(...points.map((p) => p.size ?? 1));
  const xOf = (v) => g.x0 + xa.frac(v) * (g.x1 - g.x0);
  const yOf = (v) => g.y1 - ya.frac(v) * (g.y1 - g.y0);

  let body = "";
  for (const t of ya.ticks) {
    body += `<line x1="${n(g.x0)}" y1="${n(yOf(t))}" x2="${n(g.x1)}" y2="${n(yOf(t))}" class="grid"/>`;
    body += `<text x="${n(g.x0 - 8)}" y="${n(yOf(t) + 4)}" class="tick tick-y">${esc(ya.label(t))}</text>`;
  }
  for (const t of xa.ticks) {
    if (baseOf(xScale)) body += `<line x1="${n(xOf(t))}" y1="${n(g.y0)}" x2="${n(xOf(t))}" y2="${n(g.y1)}" class="grid"/>`;
    body += xTick(xOf(t), g.y1 + 18, xa.label(t));
  }
  const colors = series.map((s, i) => TONE_INK[s.tone] ?? seriesColor(i));
  series.forEach((s, i) => {
    // One title per group: a hover target per dot would cost more than the dots.
    body += `<g fill="${colors[i]}" fill-opacity="0.6" stroke="${colors[i]}" stroke-width="1.2"><title>${esc(s.name)}</title>`;
    for (const [x, y] of s.points) body += `<circle cx="${n(xOf(x))}" cy="${n(yOf(y))}" r="4.5"/>`;
    body += `</g>`;
  });
  for (const p of series.length ? [] : points) {
    const r = p.size ? 5 + Math.sqrt(p.size / maxSize) * 13 : 5;
    body += `<circle cx="${n(xOf(p.x))}" cy="${n(yOf(p.y))}" r="${n(r)}" fill="${color}" fill-opacity="0.55" ` +
      `stroke="${color}" stroke-width="1.5">` +
      `<title>${esc(p.label ?? "")}${p.label ? " · " : ""}${esc(fx(p.x))}, ${esc(fy(p.y))}</title></circle>`;
  }
  for (const m of marks) {
    const cx = xOf(m.at[0]), cy = yOf(m.at[1]);
    const d = `M${n(cx - 6)},${n(cy - 6)} L${n(cx + 6)},${n(cy + 6)} M${n(cx + 6)},${n(cy - 6)} L${n(cx - 6)},${n(cy + 6)}`;
    // A white cross on a black outline reads over any group colour.
    body += `<path d="${d}" stroke="#000" stroke-width="6" stroke-linecap="round"/>` +
      `<path d="${d}" stroke="#fff" stroke-width="2.5" stroke-linecap="round">` +
      `<title>${esc(m.label ?? "")}${m.label ? " · " : ""}${esc(fx(m.at[0]))}, ${esc(fy(m.at[1]))}</title></path>`;
    if (m.label) {
      const right = cx + 10 + textW(m.label) <= W + 6;
      body += `<text x="${n(right ? cx + 10 : cx - 10)}" y="${n(cy - 8 < 10 ? cy + 19 : cy - 8)}" class="tick" ` +
        `text-anchor="${right ? "start" : "end"}">${esc(m.label)}</text>`;
    }
  }
  body += `<line x1="${n(g.x0)}" y1="${n(g.y1)}" x2="${n(g.x1)}" y2="${n(g.y1)}" class="axis"/>`;
  if (xTitle) body += xTick((g.x0 + g.x1) / 2, H - 6, xTitle);
  if (yTitle) body += `<text transform="translate(14,${n((g.y0 + g.y1) / 2)}) rotate(-90)" class="tick" text-anchor="middle">${esc(yTitle)}</text>`;
  return frame(svgOpen(W, H, title || "scatter") + body + "</svg>", title, note,
    series.length ? legend(series.map((s) => s.name), "bar", colors) : "");
}

/**
 * Funnel: ordered stages with a drop-off between each.
 * rows: [{ label, value }] in descending order. The step change sits in a
 * right-aligned column: red for a drop, green for a gain.
 */
export function funnel(rows, { title = "", note = "", format = (v) => compact(v) } = {}) {
  const W = 720, rowH = 40, H = rows.length * rowH + 8;
  const steps = rows.map((r, i) => {
    if (!i) return null;
    const prev = rows[i - 1].value;
    const pct = Math.round(prev ? (r.value / prev - 1) * 100 : 0);
    return { text: `${pct > 0 ? "+" : ""}${pct}%`, ink: pct < 0 ? BAD : pct > 0 ? GOOD : "" };
  });
  const labelW = Math.max(150, Math.ceil(widest(rows.map((r) => r.label)) + 14));
  // Right of the widest bar: 9px, its value, 16px, then the step column.
  const valW = widest(rows.map((r) => format(r.value)));
  const stepW = widest(steps.map((s) => s?.text ?? ""));
  const g = { x0: labelW, x1: W - Math.ceil(9 + valW + 16 + stepW) };
  const first = rows[0]?.value ?? 0;
  let body = "";
  rows.forEach((r, i) => {
    const y = 4 + i * rowH;
    const w = first ? (r.value / first) * (g.x1 - g.x0) : 0;
    // One hue, stepping darker down the funnel: an ordinal ramp, not eight hues.
    const fill = mix(SERIES[0], 1 - i * 0.13);
    body += `<text x="${n(labelW - 12)}" y="${n(y + 22)}" class="tick tick-y">${esc(r.label)}</text>`;
    body += `<rect x="${n(g.x0)}" y="${n(y + 4)}" width="${n(Math.max(0, w))}" height="26" rx="4" fill="${fill}">` +
      `<title>${esc(r.label)}: ${esc(format(r.value))}</title></rect>`;
    body += `<text x="${n(g.x0 + w + 9)}" y="${n(y + 22)}" class="val val-left">${esc(format(r.value))}</text>`;
    const step = steps[i];
    if (step) body += `<text x="${W}" y="${n(y + 22)}" class="val val-end"${inkStyle(step.ink)}>${step.text}</text>`;
  });
  return frame(svgOpen(W, H, title || "funnel") + body + "</svg>", title, note);
}

/**
 * Schedule bars over a date range. tasks: [{ label, start, end, tone?, done? }]
 * with ISO date strings. Ticks fall on month boundaries.
 */
export function schedule(tasks, { title = "", note = "" } = {}) {
  const W = 720, rowH = 30, H = tasks.length * rowH + 34;
  const labelW = Math.max(150, Math.ceil(widest(tasks.map((t) => t.label)) + 14));
  const g = { x0: labelW, x1: W - 14 };
  const t0 = Math.min(...tasks.map((t) => Date.parse(t.start)));
  const t1 = Math.max(...tasks.map((t) => Date.parse(t.end)));
  const xOf = (ms) => g.x0 + ((ms - t0) / (t1 - t0 || 1)) * (g.x1 - g.x0);

  // Month boundaries inside the window.
  const marks = [];
  if (Number.isFinite(t0) && Number.isFinite(t1)) {
    const cur = new Date(t0);
    cur.setUTCDate(1);
    cur.setUTCHours(0, 0, 0, 0);
    while (cur.getTime() <= t1) {
      if (cur.getTime() >= t0) marks.push(new Date(cur));
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
  }
  const opening = new Date(Number.isFinite(t0) ? t0 : 0);
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // The opening month names the stretch before the first boundary; drop it when
  // that boundary's own label would sit on top of it.
  const openLabel = MON[opening.getUTCMonth()];
  const firstMark = marks.length ? fitX(xOf(marks[0].getTime()), MON[marks[0].getUTCMonth()]) - textW("Mon") / 2 : Infinity;
  let body = firstMark < g.x0 + textW(openLabel) + 8
    ? ""
    : `<text x="${n(g.x0)}" y="12" class="tick" text-anchor="start">${openLabel}</text>`;
  for (const m of marks) {
    const x = xOf(m.getTime());
    body += `<line x1="${n(x)}" y1="18" x2="${n(x)}" y2="${n(H - 22)}" class="grid"/>`;
    body += xTick(x, 12, MON[m.getUTCMonth()]);
  }
  tasks.forEach((t, i) => {
    const y = 22 + i * rowH;
    const x = xOf(Date.parse(t.start));
    const w = Math.max(4, xOf(Date.parse(t.end)) - x);
    body += `<text x="${n(labelW - 12)}" y="${n(y + 17)}" class="tick tick-y">${esc(t.label)}</text>`;
    body += `<rect x="${n(x)}" y="${n(y + 5)}" width="${n(w)}" height="16" rx="4" ` +
      `fill="${toneInk(t.tone, t.done ? GOOD : SERIES[0])}" fill-opacity="${t.done ? 0.9 : 0.75}">` +
      `<title>${esc(t.label)}: ${esc(t.start)} to ${esc(t.end)}</title></rect>`;
  });
  return frame(svgOpen(W, H, title || "schedule") + body + "</svg>", title, note);
}

/**
 * Small multiples: one panel per item, shared y scale, so panels compare.
 * items: [{ label, values: [..] }]
 */
export function smallMultiples(labels, items, {
  title = "", note = "", format = (v) => compact(v), cols = 3, panelH = 96,
} = {}) {
  const W = 720;
  const rows = Math.ceil(items.length / cols);
  const gap = 16;
  const pw = (W - gap * (cols - 1)) / cols;
  const H = rows * (panelH + 26);
  const max = Math.max(...items.flatMap((i) => i.values));
  const { top } = ticks(max);

  let body = "";
  items.forEach((item, idx) => {
    const cx = (idx % cols) * (pw + gap);
    const cy = Math.floor(idx / cols) * (panelH + 26);
    const y0 = cy + 18, y1 = cy + 18 + panelH - 22;
    const xOf = (i) => cx + 2 + (i / Math.max(1, item.values.length - 1)) * (pw - 4);
    const yOf = (v) => y1 - (v / top) * (y1 - y0);
    body += `<text x="${n(cx)}" y="${n(cy + 11)}" class="tick" text-anchor="start">${esc(item.label)}</text>`;
    body += `<line x1="${n(cx)}" y1="${n(y1)}" x2="${n(cx + pw)}" y2="${n(y1)}" class="grid"/>`;
    const d = item.values.map((v, i) => `${i ? "L" : "M"}${n(xOf(i))},${n(yOf(v))}`).join(" ");
    body += `<path d="${d}" fill="none" stroke="${SERIES[0]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const li = item.values.length - 1;
    body += `<circle cx="${n(xOf(li))}" cy="${n(yOf(item.values[li]))}" r="3.5" fill="${SERIES[0]}" stroke="#000" stroke-width="2"/>`;
    body += `<text x="${n(cx + pw)}" y="${n(cy + 11)}" class="val val-end">${esc(format(item.values[li]))}</text>`;
  });
  return frame(
    svgOpen(W, H, title || "small multiples") + body + "</svg>",
    title,
    note + (note ? " " : "") + `All panels share one scale, 0 to ${format(top)}.`,
  );
}

/**
 * Share of a whole, as one stacked strip rather than a pie.
 * parts: [{ label, value }]
 */
export function shareBar(parts, { title = "", note = "", format = (v) => compact(v) } = {}) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const W = 720, H = 30;
  let x = 0, body = "";
  parts.forEach((p, i) => {
    const w = (p.value / total) * W - (i < parts.length - 1 ? 2 : 0);
    body += `<rect x="${n(x)}" y="0" width="${n(Math.max(0, w))}" height="22" rx="3" fill="${seriesColor(i)}">` +
      `<title>${esc(p.label)}: ${esc(format(p.value))} (${((p.value / total) * 100).toFixed(1)}%)</title></rect>`;
    x += w + 2;
  });
  const keys = parts.map((p, i) =>
    `<span class="key"><span class="swatch" style="background:${seriesColor(i)}"></span>${esc(p.label)} ` +
    `<span class="pctn">${((p.value / total) * 100).toFixed(0)}%</span></span>`).join("");
  return `<figure class="fig">` +
    (title ? `<figcaption class="fig-title">${esc(title)}</figcaption>` : "") +
    `<div class="fig-scroll">` + svgOpen(W, H, title || "share") + body + `</svg></div>` +
    `<div class="legend">${keys}</div>` +
    (note ? `<div class="fig-note">${esc(note)}</div>` : "") + `</figure>`;
}

/** Zip parallel `labels` / `values` arrays into the row shape the primitives take. */
const rowsOf = (labels = [], values = [], tones = []) =>
  labels.map((label, i) => (tones[i] ? { label, value: values[i], tone: tones[i] } : { label, value: values[i] }));

/** `[{ name, values }]` -> per-label rows, for grouped and stacked columns. */
const seriesRows = (labels = [], series = []) =>
  labels.map((label, i) => ({ label, values: series.map((s) => s.values?.[i] ?? 0) }));

/**
 * Render one `chart` block.
 *
 * Dispatches on `block.kind` and maps the document's data shape onto the
 * primitive above it. `data.format` picks a preset from {@link FORMATS};
 * `data.src` has already been resolved to inline data by the caller.
 *
 * @param {ChartBlock} block a normalized, validated chart block
 * @returns {string} HTML; an empty string for a kind this module does not draw
 */
export function renderChart(block) {
  const d = /** @type {any} */ (block?.data ?? {});
  const kind = block?.kind ?? "";
  const fmt = formatter(d.format);
  const base = { title: d.title ?? "", note: d.note ?? "", format: fmt };
  const labels = d.labels ?? [];
  const values = d.values ?? [];
  const series = d.series ?? [];
  const names = series.map((s, i) => s.name ?? s.label ?? `Series ${i + 1}`);

  switch (kind) {
    case "columns":
      return columns(rowsOf(labels, values, d.tones ?? []), { ...base, height: d.height ?? 220, labelBars: d.labelBars !== false });
    case "bars":
      return bars(rowsOf(labels, values, d.tones ?? []), base);
    case "lines":
      return lines(labels, series, {
        ...base, height: d.height ?? (d.square === true ? 320 : 240), area: d.area === true, zeroFloor: d.zeroFloor !== false,
        x: d.x ?? null, xScale: d.xScale ?? "linear", yScale: d.yScale ?? "linear",
        refs: d.refs ?? [], xTitle: d.xTitle ?? "", yTitle: d.yTitle ?? "", square: d.square === true,
      });
    case "grouped":
      return grouped(seriesRows(labels, series), names, { ...base, height: d.height ?? 230 });
    case "stacked":
      return stacked(seriesRows(labels, series), names, { ...base, height: d.height ?? 230 });
    case "delta":
      return delta(rowsOf(labels, values), {
        ...base,
        format: (v) => (v > 0 ? "+" : "") + fmt(v),
        height: d.height ?? 190,
        higherIsBetter: d.higherIsBetter !== false,
      });
    case "whisker":
      return whisker(labels.map((label, i) => ({ label, mid: d.mid?.[i] ?? 0, lo: d.lo?.[i] ?? 0, hi: d.hi?.[i] ?? 0 })), base);
    case "heatmap":
      return heatmap(d.rows ?? [], d.cols ?? [], d.values ?? [], {
        ...base, format: Number.isInteger(d.decimals) ? fixed(d.decimals) : fmt, emphasis: d.emphasis ?? "",
      });
    case "waterfall": {
      const totals = new Set(d.totals ?? []);
      return waterfall(labels.map((label, i) => ({ label, value: values[i], total: totals.has(i) || undefined })), {
        ...base, height: d.height ?? 230, higherIsBetter: d.higherIsBetter !== false,
      });
    }
    case "scatter":
      return scatter(d.points ?? [], {
        title: base.title, note: base.note, height: d.height ?? 280,
        xTitle: d.xTitle ?? "", yTitle: d.yTitle ?? "", fx: fmt, fy: fmt,
        xScale: d.xScale ?? "linear", yScale: d.yScale ?? "linear",
        series: d.series ?? [], marks: d.marks ?? [],
      });
    case "funnel":
      return funnel(rowsOf(labels, values), base);
    case "schedule":
      return schedule(d.tasks ?? [], { title: base.title, note: base.note });
    case "small-multiples": {
      // Accepts either `items: [{ label, values }]` or the `series: [{ name, values }]`
      // spelling the other multi-series charts use.
      const items = (d.items ?? series).map((s, i) => ({ label: s.label ?? s.name ?? `Panel ${i + 1}`, values: s.values ?? [] }));
      return smallMultiples(labels, items, { ...base, cols: d.cols ?? 3, panelH: d.panelH ?? 96 });
    }
    case "share": {
      const parts = d.parts ?? rowsOf(labels, values);
      return shareBar(parts, base);
    }
    default:
      return "";
  }
}

export { esc };
