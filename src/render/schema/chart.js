/**
 * `chart <kind>` fences.
 *
 * One body shape per kind, each checked against what the drawing primitive in
 * `charts.mjs` actually needs: equal-length series, a rows x cols matrix, an
 * ordered whisker, month-resolvable dates. A chart that validates here is a
 * chart the renderer can draw without a guard.
 *
 * A body may instead be `{"src": "data/x.json"}`: the rows live in a side file
 * and WP4 loads them, so only the envelope is checked here.
 *
 * @module render/schema/chart
 */

import {
  Ctx, ptr, show, wantObject, wantArray, wantNonEmptyArray, wantNumber, wantText,
  optionalString, optionalBoolean, wantFormat, wantTone, numberArrayOfLength,
  labelArray, seriesCap, unknownKeys, wantIsoDate, isoMs, numberArray, optionalEnum,
  tooMany, isObject,
} from "./common.js";


/** Every `chart` sub-kind, in the order the error message lists them. */
export const CHART_KINDS = /** @type {const} */ ([
  "columns", "bars", "lines", "grouped", "stacked", "delta", "whisker", "heatmap",
  "waterfall", "scatter", "funnel", "schedule", "small-multiples", "share",
]);

/** Axis scales `lines` and `scatter` accept; `linear` is the default. */
export const SCALES = /** @type {const} */ (["linear", "log2", "log10"]);

/** Scatter carries its own axis titles and scales on top of the envelope. */
const SCATTER_KEYS = ["points", "series", "marks", "xTitle", "yTitle", "xScale", "yScale", "labels", "pareto", "quadrant"];

/** Keys `chart lines` accepts on top of the envelope. */
const LINES_KEYS = ["labels", "x", "series", "area", "zeroFloor", "xScale", "yScale", "refs", "xTitle", "yTitle", "square"];

/** `[x, y]` pairs in one series (and flat scatter points). */
const MAX_POINTS = 1000;
/** Scatter dots across every series: each is its own element, so the total is what costs bytes. */
const MAX_SCATTER_POINTS = 2000;
const MAX_REFS = 8;
const MAX_MARKS = 32;
/** Heatmap rows and columns: past this the cells are too thin to carry a value. */
const MAX_CELLS_SIDE = 40;
/** A linear axis keeps its values within this magnitude, so tick steps stay finite. */
const LINEAR_LIMIT = 1e15;

/** A scatter point label, drawn beside its dot. */
const MAX_POINT_LABEL = 60;
/** `labels: true` draws one text per labelled point; past this the plot is all text. */
const MAX_LABELLED = 300;

/** Keys every chart envelope carries regardless of kind. */
const BASE_KEYS = ["title", "note", "caption", "format", "src", "views", "controls"];

const KIND_SET = new Set(CHART_KINDS);

/**
 * @param {Ctx} ctx
 * @param {Record<string, unknown>} body
 */
function envelope(ctx, body) {
  optionalString(ctx, body.title, "/title");
  optionalString(ctx, body.note, "/note");
  optionalString(ctx, body.caption, "/caption");
  wantFormat(ctx, body.format, "/format");
}

/**
 * `labels` + one `values` array of the same length. Shared by the single-series
 * kinds: columns, bars, delta, funnel, share, waterfall.
 *
 * @returns {number} the label count, or -1 when the labels themselves are bad
 */
function labelsAndValues(ctx, body) {
  if (!labelArray(ctx, body.labels, "/labels")) return -1;
  const labels = /** @type {string[]} */ (body.labels);
  numberArrayOfLength(ctx, body.values, "/values", labels.length, "labels");
  return labels.length;
}

/**
 * `labels` + `series: [{ name, values }]`, every series as long as `labels` and
 * at most eight of them.
 */
function labelsAndSeries(ctx, body) {
  if (!labelArray(ctx, body.labels, "/labels")) return;
  seriesOf(ctx, body, /** @type {string[]} */ (body.labels).length, "labels", ["name", "values", "tone"]);
}

/**
 * `series: [{ name, values }]`, each `count` long to match `against`.
 * @returns {boolean} true when every series checked out
 */
function seriesOf(ctx, body, count, against, keys) {
  if (!wantNonEmptyArray(ctx, body.series, "/series", "at least one series")) return false;
  const series = /** @type {unknown[]} */ (body.series);
  const start = ctx.errors.length;
  seriesCap(ctx, series.length, "/series");
  series.forEach((s, i) => {
    const at = ptr("", "series", i);
    if (!wantObject(ctx, s, at, "a series { name, values }")) return;
    wantText(ctx, s.name, ptr(at, "name"), "a series name");
    numberArrayOfLength(ctx, s.values, ptr(at, "values"), count, against);
    unknownKeys(ctx, s, at, keys);
    wantTone(ctx, s.tone, ptr(at, "tone"));
    if (keys.includes("dashed")) optionalBoolean(ctx, s.dashed, ptr(at, "dashed"));
  });
  return ctx.errors.length === start;
}

/**
 * A log axis cannot place zero or a negative number. Reports every offending
 * value at `pointerOf(i)`; a no-op on a linear axis.
 * @returns {boolean} true when every value can be placed
 */
function positiveOnLog(ctx, values, scale, axis, pointerOf) {
  if (scale !== "log2" && scale !== "log10") return true;
  let ok = true;
  values.forEach((v, i) => {
    if (!(v > 0)) ok = ctx.at(pointerOf(i), `expected a value > 0 on the ${scale} ${axis} axis, got ${show(v)}`);
    // Ticks round out to the next power of the base, which must stay a finite, non-zero double.
    else if (v < 1e-100 || v > 1e100) ok = ctx.at(pointerOf(i), `expected a value from 1e-100 to 1e100 on the ${scale} ${axis} axis, got ${show(v)}`);
  });
  return ok;
}

/**
 * `chart lines`: categorical `labels`, or numeric `x` positions (required for
 * a log x axis), with series as long as whichever one is given.
 */
function linesBody(ctx, body) {
  const xOk = optionalEnum(ctx, body.xScale, "/xScale", SCALES);
  const yOk = optionalEnum(ctx, body.yScale, "/yScale", SCALES);
  const scalesOk = xOk && yOk;
  const keys = ["name", "values", "tone", "dashed"];
  if (body.x === undefined) {
    if (body.xScale === "log2" || body.xScale === "log10") {
      ctx.at("/x", `expected an array of numbers for xScale ${show(body.xScale)}, got nothing`);
    }
    refsOf(ctx, body, false, scalesOk);
    if (tooMany(ctx, body.labels, "/labels", MAX_POINTS, "labels") || !labelArray(ctx, body.labels, "/labels")) return;
    const ok = seriesOf(ctx, body, /** @type {string[]} */ (body.labels).length, "labels", keys);
    if (ok && scalesOk) logSeries(ctx, body);
    return;
  }
  refsOf(ctx, body, true, scalesOk);

  if (tooMany(ctx, body.x, "/x", 1000, "x values") || !numberArray(ctx, body.x, "/x", "an array of numbers")) return;
  const x = /** @type {number[]} */ (body.x);
  if (x.length < 2) {
    ctx.at("/x", `expected at least 2 numbers, got ${x.length}`);
    return;
  }
  for (let i = 1; i < x.length; i++) {
    if (!(x[i] > x[i - 1])) {
      ctx.at(ptr("", "x", i), `expected x to increase, got ${show(x[i])} after ${show(x[i - 1])}`);
      return;
    }
  }
  if (scalesOk) positiveOnLog(ctx, x, body.xScale, "x", (i) => ptr("", "x", i));
  // A linear x axis is ticked in steps of its span, which must stay finite and well above zero.
  if (body.xScale !== "log2" && body.xScale !== "log10") {
    const bad = x.findIndex((v) => Math.abs(v) > 1e15);
    if (bad >= 0) ctx.at(ptr("", "x", bad), `expected a value within ±1e15, got ${show(x[bad])}; rescale the units`);
    else if (x[x.length - 1] - x[0] < 1e-300) ctx.at("/x", `expected x to span at least 1e-300, got ${x[x.length - 1] - x[0]}; rescale the units`);
  }
  // Labels are optional beside `x`; when given they name each point.
  if (body.labels !== undefined && labelArray(ctx, body.labels, "/labels")) {
    const n = /** @type {string[]} */ (body.labels).length;
    if (n !== x.length) ctx.at("/labels", `expected ${x.length} labels to match x, got ${n}`);
  }
  if (seriesOf(ctx, body, x.length, "x", keys) && scalesOk) logSeries(ctx, body);
}

/** Every series value must be positive on a log y axis. */
function logSeries(ctx, body) {
  /** @type {{ values: number[] }[]} */ (body.series).forEach((s, si) =>
    positiveOnLog(ctx, s.values, body.yScale, "y", (i) => ptr("", "series", si, "values", i)));
}

/* --------------------------------------------- numeric pairs, refs and marks */

const isLog = (scale) => scale === "log2" || scale === "log10";

/**
 * One number on an axis: positive and placeable on a log axis, within
 * ±1e15 on a linear one. `v` is already known to be finite.
 */
function onAxis(ctx, v, scale, axis, at) {
  if (isLog(scale)) return positiveOnLog(ctx, [v], scale, axis, () => at);
  if (Math.abs(v) > LINEAR_LIMIT) return ctx.at(at, `expected a value within ±1e15, got ${show(v)}; rescale the units`);
  return true;
}

/**
 * An `[x, y]` pair of finite numbers, each placeable on its axis.
 * @param {{ xScale?: unknown, yScale?: unknown }} scales
 */
function pair(ctx, p, at, scales, labelled = false) {
  if (labelled && Array.isArray(p) && p.length === 3) {
    if (typeof p[2] !== "string" || !p[2].trim()) return ctx.at(ptr(at, 2), `expected a point label, got ${show(p[2])}`);
    if (p[2].length > MAX_POINT_LABEL) return ctx.at(ptr(at, 2), `expected a label of at most ${MAX_POINT_LABEL} characters, got ${p[2].length}`);
  } else if (!Array.isArray(p) || p.length !== 2) {
    return ctx.at(at, `expected an [x, y]${labelled ? " or [x, y, label]" : ""} pair, got ${show(p)}`);
  }
  const xOk = wantNumber(ctx, p[0], ptr(at, 0)) && onAxis(ctx, p[0], scales.xScale, "x", ptr(at, 0));
  const yOk = wantNumber(ctx, p[1], ptr(at, 1)) && onAxis(ctx, p[1], scales.yScale, "y", ptr(at, 1));
  return xOk && yOk;
}

/**
 * A list of `[x, y]` pairs: capped, at least `min` long, each pair checked.
 * @returns {boolean} true when every pair checked out
 */
function pairList(ctx, v, at, min, scales, labelled = false) {
  if (tooMany(ctx, v, at, MAX_POINTS, "points")) return false;
  if (!wantArray(ctx, v, at, "an array of [x, y] pairs")) return false;
  if (v.length < min) return ctx.at(at, `expected at least ${min} [x, y] pair${min > 1 ? "s" : ""}, got ${v.length}`);
  let ok = true;
  v.forEach((p, i) => { if (!pair(ctx, p, ptr(at, i), scales, labelled)) ok = false; });
  return ok;
}

/**
 * A linear axis is ticked in steps of its span, which must stay well above
 * zero. `zero` folds 0 into the range, as the renderer does.
 */
function spanOk(ctx, values, scale, zero, axis, at) {
  if (isLog(scale) || values.length === 0) return;
  let lo = zero ? 0 : Infinity, hi = zero ? 0 : -Infinity;
  for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
  // A constant axis is ticked by its magnitude instead of its span. Below 1e-300 a tick
  // step is no longer a normal double and the plot would carry NaN; anything above renders.
  const reach = hi - lo || Math.max(Math.abs(lo), Math.abs(hi));
  if (reach > 0 && reach < 1e-300) ctx.at(at, `expected the ${axis} values to span or reach at least 1e-300, got ${reach}; rescale the units`);
}

/** True when a lines body draws `points` series rather than `values` over shared labels or x. */
const hasPointSeries = (body) =>
  Array.isArray(body.series) && body.series.some((s) => isObject(s) && s.points !== undefined);

/**
 * `chart lines` with per-series `points: [[x, y], ...]`, so series need not
 * share an x (ROC curves, train and val logged at different epochs). Shared
 * `labels` / `x` and per-series `values` belong to the other shape.
 */
function pointLinesBody(ctx, body) {
  const scalesOk = optionalEnum(ctx, body.xScale, "/xScale", SCALES) && optionalEnum(ctx, body.yScale, "/yScale", SCALES);
  for (const key of ["labels", "x"]) {
    if (body[key] !== undefined) ctx.at(`/${key}`, `cannot be combined with series points; each series carries its own [x, y] pairs`);
  }
  const series = /** @type {unknown[]} */ (body.series);
  if (!seriesCap(ctx, series.length, "/series")) return;
  const scales = scalesOk ? body : {};
  /** @type {number[]} */ const xs = [];
  /** @type {number[]} */ const ys = [];
  let ok = true;
  series.forEach((s, i) => {
    const at = ptr("", "series", i);
    if (!wantObject(ctx, s, at, "a series { name, points }")) { ok = false; return; }
    wantText(ctx, s.name, ptr(at, "name"), "a series name");
    if (s.values !== undefined) {
      ok = ctx.at(ptr(at, "values"), "cannot be combined with points; give every series points");
    } else if (s.points === undefined) {
      ok = ctx.at(ptr(at, "points"), "expected [[x, y], ...] like the other series, got nothing");
    }
    if (s.points !== undefined) {
      if (pairList(ctx, s.points, ptr(at, "points"), 2, scales)) {
        for (const [x, y] of /** @type {[number, number][]} */ (s.points)) { xs.push(x); ys.push(y); }
      } else ok = false;
    }
    wantTone(ctx, s.tone, ptr(at, "tone"));
    optionalBoolean(ctx, s.dashed, ptr(at, "dashed"));
    // `values` is reported above in terms of this shape, so it is not unknown here too.
    unknownKeys(ctx, s, at, s.values === undefined ? ["name", "points", "tone", "dashed"] : ["name", "points", "tone", "dashed", "values"]);
  });
  const refs = refsOf(ctx, body, true, scalesOk);
  if (!ok || !refs || !scalesOk) return;
  spanOk(ctx, [...xs, ...refs.x], body.xScale, true, "x", "/series");
  spanOk(ctx, [...ys, ...refs.y], body.yScale, body.zeroFloor !== false, "y", "/series");
}

/**
 * `refs`: dashed reference lines. `"diagonal"` is y = x across the plotted
 * range, `{ "y": n }` and `{ "x": n }` are a level and a moment, each with an
 * optional `label`. An x reference or the diagonal needs a numeric x axis.
 *
 * @returns {{ x: number[], y: number[] } | null} the placed values, or null on any error
 */
function refsOf(ctx, body, numericX, scalesOk) {
  const out = { x: /** @type {number[]} */ ([]), y: /** @type {number[]} */ ([]) };
  if (body.refs === undefined) return out;
  if (tooMany(ctx, body.refs, "/refs", MAX_REFS, "refs") || !wantArray(ctx, body.refs, "/refs", "an array of refs")) return null;
  const start = ctx.errors.length;
  const what = `"diagonal", { "y": n } or { "x": n }`;
  const noX = (at) => ctx.at(at, "needs a numeric x axis; give x or series points");
  /** @type {unknown[]} */ (body.refs).forEach((r, i) => {
    const at = ptr("", "refs", i);
    if (r === "diagonal") {
      if (!numericX) noX(at);
      else if (scalesOk && (body.xScale ?? "linear") !== (body.yScale ?? "linear")) {
        ctx.at(at, `expected the same xScale and yScale for the diagonal, got ${show(body.xScale ?? "linear")} and ${show(body.yScale ?? "linear")}`);
      }
      return;
    }
    if (!isObject(r)) { ctx.at(at, `expected ${what}, got ${show(r)}`); return; }
    const axis = r.x !== undefined ? "x" : "y";
    if (r.x !== undefined && r.y !== undefined) ctx.at(at, "expected one of x or y, got both; give each line its own ref");
    else if (r.x === undefined && r.y === undefined) ctx.at(at, `expected ${what}, got an object with neither`);
    else if (axis === "x" && !numericX) noX(ptr(at, "x"));
    else if (wantNumber(ctx, r[axis], ptr(at, axis)) && (!scalesOk || onAxis(ctx, r[axis], body[`${axis}Scale`], axis, ptr(at, axis)))) {
      out[axis].push(/** @type {number} */ (r[axis]));
    }
    optionalString(ctx, r.label, ptr(at, "label"));
    unknownKeys(ctx, r, at, ["x", "y", "label"]);
  });
  return ctx.errors.length === start ? out : null;
}

/**
 * Scatter `series: [{ name, points: [[x, y], ...], tone? }]`: coloured groups
 * with a legend, in place of the flat `points`.
 */
function scatterSeries(ctx, body, scalesOk, marks) {
  if (!wantNonEmptyArray(ctx, body.series, "/series", "at least one series")) return;
  const series = /** @type {unknown[]} */ (body.series);
  if (!seriesCap(ctx, series.length, "/series")) return;
  const scales = scalesOk ? body : {};
  let total = 0;
  for (const s of series) if (isObject(s) && Array.isArray(s.points)) total += s.points.length;
  if (total > MAX_SCATTER_POINTS) {
    ctx.at("/series", `expected at most ${MAX_SCATTER_POINTS} points across all series, got ${total}; sample them`);
    return;
  }
  /** @type {number[]} */ const xs = [];
  /** @type {number[]} */ const ys = [];
  let ok = true;
  series.forEach((s, i) => {
    const at = ptr("", "series", i);
    if (!wantObject(ctx, s, at, "a series { name, points }")) { ok = false; return; }
    wantText(ctx, s.name, ptr(at, "name"), "a series name");
    if (pairList(ctx, s.points, ptr(at, "points"), 1, scales, true)) {
      for (const [x, y] of /** @type {[number, number][]} */ (s.points)) { xs.push(x); ys.push(y); }
    } else ok = false;
    wantTone(ctx, s.tone, ptr(at, "tone"));
    unknownKeys(ctx, s, at, ["name", "points", "tone"]);
  });
  if (!ok || !scalesOk) return;
  // Marks share the axes, so they count toward the plotted domain.
  spanOk(ctx, [...xs, ...marks.xs], body.xScale, false, "x", "/series");
  spanOk(ctx, [...ys, ...marks.ys], body.yScale, false, "y", "/series");
}

/** Scatter `marks: [{ at: [x, y], label? }]`, drawn as a labelled cross (a centroid). */
function marksOf(ctx, marks, scales, flat) {
  /** @type {{ xs: number[], ys: number[] }} */ const out = { xs: [], ys: [] };
  if (marks === undefined) return out;
  if (tooMany(ctx, marks, "/marks", MAX_MARKS, "marks") || !wantArray(ctx, marks, "/marks", "an array of marks")) return out;
  marks.forEach((m, i) => {
    const at = ptr("", "marks", i);
    if (!wantObject(ctx, m, at, "a mark { at: [x, y], label }")) return;
    if (pair(ctx, m.at, ptr(at, "at"), scales)) {
      const [x, y] = /** @type {[number, number]} */ (m.at);
      // Flat points are drawn on axes that start at 0, so a negative mark would land off the plot.
      if (flat && (x < 0 || y < 0)) ctx.at(ptr(at, "at"), `expected coordinates of 0 or more beside flat points, got [${x}, ${y}]; use series for negative data`);
      out.xs.push(x); out.ys.push(y);
    }
    optionalString(ctx, m.label, ptr(at, "label"));
    unknownKeys(ctx, m, at, ["at", "label"]);
  });
  return out;
}

/** Plot corners, for the scatter `pareto` and `quadrant` annotations. */
export const CORNERS = /** @type {const} */ (["top-left", "top-right", "bottom-left", "bottom-right"]);

/**
 * Scatter `labels`, `pareto` and `quadrant`. `labels: true` needs something to
 * name: a flat point's `label` or a series point's third element.
 */
function scatterAnnotations(ctx, body) {
  optionalEnum(ctx, body.pareto, "/pareto", CORNERS);
  optionalEnum(ctx, body.quadrant, "/quadrant", CORNERS);
  if (!optionalBoolean(ctx, body.labels, "/labels") || body.labels !== true) return;
  let count = 0;
  if (Array.isArray(body.series)) {
    for (const s of body.series) {
      if (isObject(s) && Array.isArray(s.points)) for (const p of s.points) if (Array.isArray(p) && typeof p[2] === "string") count++;
    }
  } else if (Array.isArray(body.points)) {
    for (const p of body.points) if (isObject(p) && typeof p.label === "string" && p.label) count++;
  }
  if (count === 0) {
    ctx.at("/labels", "expected labelled points, got none; give flat points a label or series points a third element [x, y, \"name\"]");
  } else if (count > MAX_LABELLED) {
    ctx.at("/labels", `expected at most ${MAX_LABELLED} labelled points, got ${count}; label only the ones worth naming`);
  }
}

/**
 * Heatmap `emphasis` and `decimals`. `decimals` prints every cell to that many
 * places (attention weights of 0.05 beside 0.6), so it replaces `format`.
 */
function heatmapExtras(ctx, body) {
  optionalEnum(ctx, body.emphasis, "/emphasis", ["diagonal"]);
  if (body.decimals === undefined) return;
  if (!Number.isInteger(body.decimals) || /** @type {number} */ (body.decimals) < 0 || /** @type {number} */ (body.decimals) > 6) {
    ctx.at("/decimals", `expected an integer from 0 to 6, got ${show(body.decimals)}`);
  } else if (body.format !== undefined) {
    ctx.at("/decimals", "cannot be combined with format; decimals prints every cell as a plain number");
  }
}

/** Per-kind body checks, keyed by sub-kind. Each returns the extra keys it allows. */
const KINDS = {
  columns(ctx, body) {
    labelsAndValues(ctx, body);
    return ["labels", "values"];
  },

  bars(ctx, body) {
    labelsAndValues(ctx, body);
    return ["labels", "values"];
  },

  delta(ctx, body) {
    labelsAndValues(ctx, body);
    optionalBoolean(ctx, body.higherIsBetter, "/higherIsBetter");
    return ["labels", "values", "higherIsBetter"];
  },

  funnel(ctx, body) {
    labelsAndValues(ctx, body);
    return ["labels", "values"];
  },

  share(ctx, body) {
    // One palette slot per part, so the eight-colour cap applies to the labels.
    const n = labelsAndValues(ctx, body);
    if (n > 0) seriesCap(ctx, n, "/labels", "parts");
    return ["labels", "values"];
  },

  lines(ctx, body) {
    optionalString(ctx, body.xTitle, "/xTitle");
    optionalString(ctx, body.yTitle, "/yTitle");
    optionalBoolean(ctx, body.square, "/square");
    if (hasPointSeries(body)) pointLinesBody(ctx, body);
    else {
      linesBody(ctx, body);
      if (Array.isArray(body.series)) {
        const yRefs = Array.isArray(body.refs) ? body.refs.filter(isObject).map((r) => r.y) : [];
        const vals = [...body.series.flatMap((s) => (isObject(s) && Array.isArray(s.values) ? s.values : [])), ...yRefs]
          .filter((v) => typeof v === "number" && Number.isFinite(v));
        spanOk(ctx, vals, body.yScale, body.zeroFloor !== false, "y", "/series");
      }
    }
    optionalBoolean(ctx, body.area, "/area");
    optionalBoolean(ctx, body.zeroFloor, "/zeroFloor");
    if (body.zeroFloor === true && (body.yScale === "log2" || body.yScale === "log10")) {
      ctx.at("/zeroFloor", `has no effect on a ${body.yScale} y axis, which cannot reach 0; drop it`);
    }
    return LINES_KEYS;
  },

  grouped(ctx, body) {
    labelsAndSeries(ctx, body);
    return ["labels", "series"];
  },

  stacked(ctx, body) {
    labelsAndSeries(ctx, body);
    return ["labels", "series"];
  },

  "small-multiples"(ctx, body) {
    labelsAndSeries(ctx, body);
    return ["labels", "series"];
  },

  whisker(ctx, body) {
    if (!labelArray(ctx, body.labels, "/labels")) return ["labels", "mid", "lo", "hi"];
    const labels = /** @type {string[]} */ (body.labels);
    const ok = ["mid", "lo", "hi"].map((key) =>
      numberArrayOfLength(ctx, body[key], `/${key}`, labels.length, "labels"));
    if (ok.every(Boolean)) {
      const { lo, mid, hi } = /** @type {{lo: number[], mid: number[], hi: number[]}} */ (body);
      labels.forEach((_, i) => {
        // The whisker is drawn lo -> hi with the dot at mid; out of order it
        // renders inside out rather than failing, so it has to be caught here.
        if (!(lo[i] <= mid[i])) ctx.at(ptr("", "lo", i), `expected lo <= mid, got ${show(lo[i])} > ${show(mid[i])}`);
        else if (!(mid[i] <= hi[i])) ctx.at(ptr("", "mid", i), `expected mid <= hi, got ${show(mid[i])} > ${show(hi[i])}`);
      });
    }
    return ["labels", "mid", "lo", "hi"];
  },

  heatmap(ctx, body) {
    const keys = ["rows", "cols", "values", "emphasis", "decimals"];
    heatmapExtras(ctx, body);
    const rowsOk = !tooMany(ctx, body.rows, "/rows", MAX_CELLS_SIDE, "rows") && labelArray(ctx, body.rows, "/rows", "row label");
    const colsOk = !tooMany(ctx, body.cols, "/cols", MAX_CELLS_SIDE, "cols") && labelArray(ctx, body.cols, "/cols", "column label");
    if (!rowsOk || !colsOk) return keys;
    const rows = /** @type {string[]} */ (body.rows);
    const cols = /** @type {string[]} */ (body.cols);
    if (body.emphasis === "diagonal" && rows.length !== cols.length) {
      ctx.at("/emphasis", `expected as many rows as cols for the diagonal, got ${rows.length} rows and ${cols.length} cols`);
    }
    if (!wantArray(ctx, body.values, "/values", `${rows.length} rows to match rows`)) return keys;
    const values = /** @type {unknown[]} */ (body.values);
    if (values.length !== rows.length) {
      ctx.at("/values", `expected ${rows.length} rows to match rows, got ${values.length}`);
      return keys;
    }
    values.forEach((row, y) => {
      numberArrayOfLength(ctx, row, ptr("", "values", y), cols.length, "cols");
    });
    return keys;
  },

  waterfall(ctx, body) {
    const n = labelsAndValues(ctx, body);
    if (body.totals !== undefined) {
      if (wantArray(ctx, body.totals, "/totals", "an array of label indices")) {
        const totals = /** @type {unknown[]} */ (body.totals);
        totals.forEach((t, i) => {
          const at = ptr("", "totals", i);
          if (!Number.isInteger(t)) {
            ctx.at(at, `expected an integer label index, got ${show(t)}`);
          } else if (n >= 0 && (/** @type {number} */ (t) < 0 || /** @type {number} */ (t) >= n)) {
            ctx.at(at, `expected a label index between 0 and ${n - 1}, got ${show(t)}`);
          }
        });
      }
    }
    optionalBoolean(ctx, body.higherIsBetter, "/higherIsBetter");
    return ["labels", "values", "totals", "higherIsBetter"];
  },

  scatter(ctx, body) {
    optionalString(ctx, body.xTitle, "/xTitle");
    optionalString(ctx, body.yTitle, "/yTitle");
    scatterAnnotations(ctx, body);
    const scalesOk = optionalEnum(ctx, body.xScale, "/xScale", SCALES) && optionalEnum(ctx, body.yScale, "/yScale", SCALES);
    const xLog = scalesOk && body.xScale;
    const yLog = scalesOk && body.yScale;
    const marks = marksOf(ctx, body.marks, scalesOk ? body : {}, body.series === undefined);
    if (body.series !== undefined) {
      if (body.points !== undefined) ctx.at("/points", "cannot be combined with series; give each group its own points");
      scatterSeries(ctx, body, scalesOk, marks);
      return SCATTER_KEYS;
    }
    if (tooMany(ctx, body.points, "/points", MAX_POINTS, "points")) return SCATTER_KEYS;
    if (!wantNonEmptyArray(ctx, body.points, "/points", "at least one point")) return SCATTER_KEYS;
    /** @type {unknown[]} */ (body.points).forEach((p, i) => {
      const at = ptr("", "points", i);
      if (!wantObject(ctx, p, at, "a point { x, y }")) return;
      if (wantNumber(ctx, p.x, ptr(at, "x"))) positiveOnLog(ctx, [p.x], xLog, "x", () => ptr(at, "x"));
      if (wantNumber(ctx, p.y, ptr(at, "y"))) positiveOnLog(ctx, [p.y], yLog, "y", () => ptr(at, "y"));
      // Flat points are drawn on axes that start at 0; a negative one would land off the plot.
      for (const k of /** @type {const} */ (["x", "y"])) {
        if (typeof p[k] === "number" && p[k] < 0 && !(k === "x" ? xLog : yLog)) ctx.at(ptr(at, k), `expected 0 or more for flat points, got ${show(p[k])}; use series for negative data`);
      }
      if (p.size !== undefined && wantNumber(ctx, p.size, ptr(at, "size"))) {
        // Bubble area is sqrt(size / max); a negative radius is not drawable.
        if (/** @type {number} */ (p.size) < 0) ctx.at(ptr(at, "size"), `expected a size of 0 or more, got ${show(p.size)}`);
      }
      optionalString(ctx, p.label, ptr(at, "label"));
      unknownKeys(ctx, p, at, ["x", "y", "size", "label"]);
    });
    const num = (v) => typeof v === "number" && Number.isFinite(v);
    const pts = /** @type {{ x?: unknown, y?: unknown }[]} */ (body.points).filter(isObject);
    spanOk(ctx, [...pts.map((p) => p.x).filter(num), ...marks.xs], body.xScale, true, "x", "/points");
    spanOk(ctx, [...pts.map((p) => p.y).filter(num), ...marks.ys], body.yScale, true, "y", "/points");
    return SCATTER_KEYS;
  },

  schedule(ctx, body) {
    if (!wantNonEmptyArray(ctx, body.tasks, "/tasks", "at least one task")) return ["tasks"];
    /** @type {unknown[]} */ (body.tasks).forEach((t, i) => {
      const at = ptr("", "tasks", i);
      if (!wantObject(ctx, t, at, "a task { label, start, end }")) return;
      wantText(ctx, t.label, ptr(at, "label"), "a task label");
      const startOk = wantIsoDate(ctx, t.start, ptr(at, "start"));
      const endOk = wantIsoDate(ctx, t.end, ptr(at, "end"));
      if (startOk && endOk && isoMs(/** @type {string} */ (t.start)) > isoMs(/** @type {string} */ (t.end))) {
        ctx.at(ptr(at, "end"), `expected end on or after start, got ${show(t.end)} before ${show(t.start)}`);
      }
      optionalBoolean(ctx, t.done, ptr(at, "done"));
      wantTone(ctx, t.tone, ptr(at, "tone"));
      unknownKeys(ctx, t, at, ["label", "start", "end", "done", "tone"]);
    });
    return ["tasks"];
  },
};

/**
 * Validate one `chart` block.
 *
 * @param {import("../ir.js").RenderError[]} errors shared sink
 * @param {{ kind: string, data: unknown, line: number }} block
 * @param {string} file
 */
export function validateChart(errors, block, file) {
  const kind = String(block.kind ?? "");
  const label = `chart ${kind}`.trim();

  if (!KIND_SET.has(/** @type {never} */ (kind))) {
    // No block label on the prefix: the block is not a kind we can name.
    errors.push({
      file, line: block.line, block: "",
      message: `unknown block "${label}"; kinds: ${CHART_KINDS.join(" ")}`,
    });
    return;
  }

  const ctx = new Ctx(errors, file, block.line, label);
  if (!wantObject(ctx, block.data, "", "an object")) return;
  const body = /** @type {Record<string, unknown>} */ (block.data);

  envelope(ctx, body);

  // `{"src": "data/x.json"}` defers the rows to a side file; WP4 loads and
  // re-validates them, so only the envelope is checked now.
  if (body.src !== undefined) {
    wantText(ctx, body.src, "/src", "a path to a JSON file");
    unknownKeys(ctx, body, "", BASE_KEYS);
    return;
  }

  if (body.views !== undefined || body.controls !== undefined) {
    controlled(ctx, kind, body);
    return;
  }
  const extra = KINDS[kind](ctx, body);
  unknownKeys(ctx, body, "", [...BASE_KEYS, ...extra]);
}

/* ------------------------------------------------------ views and controls */

/**
 * The switches a chart may offer. `log-x` / `log-y` flip an axis between
 * linear and log; `sort` reorders bars by value; `labels`, `pareto` and
 * `quadrant` show or hide that scatter annotation; `legend` lets the reader
 * hide a series; `table` swaps the plot for its numbers.
 */
export const CONTROLS = /** @type {const} */ (["log-x", "log-y", "sort", "labels", "pareto", "quadrant", "legend", "table"]);

/** The kinds each control applies to. */
const CONTROL_KINDS = {
  "log-x": ["lines", "scatter"],
  "log-y": ["lines", "scatter"],
  sort: ["columns", "bars"],
  labels: ["scatter"],
  pareto: ["scatter"],
  quadrant: ["scatter"],
  legend: ["lines", "scatter"],
  table: ["columns", "bars", "lines", "grouped", "stacked", "delta", "funnel", "waterfall", "scatter"],
};

/** Tabs over one chart slot; more than this and the tab row wraps into a menu. */
const MAX_VIEWS = 6;
const MAX_VIEW_LABEL = 40;
/** Every view times every scale and sort state is one pre-rendered SVG. */
const MAX_PANELS = 12;
/** A view overrides data, never the figure around it. */
const VIEW_FIXED = ["title", "caption", "src", "views", "controls"];

/** The other end of a log toggle: a log axis turns linear, a linear one log10. */
const flipScale = (scale) => (isLog(scale) ? "linear" : "log10");

/**
 * Every pre-rendered body a controlled chart draws: one per view, doubled for
 * each log toggle. `x` / `y` record that axis's state (`lin` or `log`) when it
 * has a toggle, so the page can show the panel matching the reader's switches.
 * Shared by the validator and the renderer, so both see exactly the same panels.
 * `sort` variants are not listed: they are reorderings of a validated panel.
 *
 * @param {Record<string, unknown>} body
 * @returns {{ v: number, label: string, x: string, y: string, data: Record<string, unknown> }[]}
 */
export function panelsOf(body) {
  const controls = Array.isArray(body.controls) ? body.controls : [];
  const { views, controls: _controls, ...base } = body;
  const list = Array.isArray(views) && views.length ? views : [{}];
  const axisStates = (on, scale) => (on ? [scale, flipScale(scale)] : [null]);
  const tag = (scale) => (scale === null ? "" : isLog(scale) ? "log" : "lin");
  /** @type {ReturnType<typeof panelsOf>} */ const out = [];
  list.forEach((view, v) => {
    const { label, ...over } = isObject(view) ? view : {};
    const merged = { ...base, ...over };
    for (const xs of axisStates(controls.includes("log-x"), merged.xScale)) {
      for (const ys of axisStates(controls.includes("log-y"), merged.yScale)) {
        const data = { ...merged };
        if (xs !== null && xs !== merged.xScale) data.xScale = xs;
        if (ys !== null && ys !== merged.yScale) {
          data.yScale = ys;
          // A log axis cannot reach zero, so the floor the author asked for on linear no longer applies.
          if (isLog(ys)) delete data.zeroFloor;
        }
        out.push({ v, label: typeof label === "string" ? label : "", x: tag(xs), y: tag(ys), data });
      }
    }
  });
  return out;
}

/**
 * A chart with `views` and/or `controls`. Checks both lists, then validates
 * every panel as a chart in its own right. A panel's errors are labelled with
 * its view and scales; one repeated by every panel is reported once.
 */
function controlled(ctx, kind, body) {
  const start = ctx.errors.length;
  if (kind === "share") {
    ctx.at(body.views !== undefined ? "/views" : "/controls", "is not available on chart share; use bars for a switchable view");
    return;
  }
  const views = viewsOf(ctx, kind, body.views);
  const controls = controlsOf(ctx, kind, body.controls);
  if (ctx.errors.length > start || !views || !controls) return;

  const panels = panelsOf(body);
  const count = panels.length * (controls.includes("sort") ? 2 : 1);
  if (count > MAX_PANELS) {
    ctx.at(controls.length ? "/controls" : "/views", `draws ${count} charts (every view times every log and sort state); at most ${MAX_PANELS}, so drop a view or a toggle`);
    return;
  }

  needs(ctx, kind, controls, panels);
  if (ctx.errors.length > start) return;

  // A fault every panel shares is the author's base data: reported once, unlabelled.
  // One only some panels have is reported once, labelled with the first panel that has it.
  /** @type {Map<string, { error: import("../ir.js").RenderError, what: string, count: number }>} */
  const found = new Map();
  let extra = /** @type {string[]} */ ([]);
  for (const p of panels) {
    /** @type {import("../ir.js").RenderError[]} */ const sink = [];
    const keys = KINDS[kind](new Ctx(sink, ctx.file, ctx.line, ctx.block), p.data);
    if (p === panels[0]) extra = keys;
    const what = [
      views.length ? `view ${JSON.stringify(p.label)}` : "",
      p.x ? `${p.x === "log" ? "log" : "linear"} x` : "",
      p.y ? `${p.y === "log" ? "log" : "linear"} y` : "",
    ].filter(Boolean).join(", ");
    for (const e of new Map(sink.map((e) => [e.message, e])).values()) {
      const seen = found.get(e.message);
      if (seen) seen.count++;
      else found.set(e.message, { error: e, what, count: 1 });
    }
  }
  for (const { error, what, count } of found.values()) {
    ctx.errors.push(count === panels.length || !what ? error : { ...error, block: `${ctx.block} (${what})` });
  }
  unknownKeys(ctx, body, "", [...BASE_KEYS, ...extra]);
  views.forEach((v, i) => unknownKeys(ctx, v, ptr("", "views", i), ["label", "note", "format", ...extra]));
}

/**
 * `views: [{ label, ...overrides }]`, 2 to 6 of them with distinct labels.
 * @returns {Record<string, unknown>[] | null} the views ([] when absent), or null when malformed
 */
function viewsOf(ctx, kind, views) {
  if (views === undefined) return [];
  if (tooMany(ctx, views, "/views", MAX_VIEWS, "views") || !wantArray(ctx, views, "/views", "an array of views")) return null;
  if (views.length < 2) return ctx.at("/views", `expected at least 2 views, got ${views.length}; one view is the chart itself`) || null;
  const labels = new Set();
  let ok = true;
  views.forEach((v, i) => {
    const at = ptr("", "views", i);
    if (!wantObject(ctx, v, at, "a view { label, ...keys it changes }")) { ok = false; return; }
    if (!wantText(ctx, v.label, ptr(at, "label"), "a tab label")) ok = false;
    else if (/** @type {string} */ (v.label).length > MAX_VIEW_LABEL) {
      ok = ctx.at(ptr(at, "label"), `expected at most ${MAX_VIEW_LABEL} characters, got ${/** @type {string} */ (v.label).length}`);
    } else if (labels.has(v.label)) ok = ctx.at(ptr(at, "label"), `expected a label of its own, got ${show(v.label)} again`);
    else labels.add(v.label);
    for (const k of VIEW_FIXED) {
      if (v[k] !== undefined) ok = ctx.at(ptr(at, k), "cannot change per view; every view shares the chart's title and frame");
    }
  });
  return ok ? /** @type {Record<string, unknown>[]} */ (views) : null;
}

/**
 * `controls: ["log-y", "table", ...]`, each once and each one this kind supports.
 * @returns {string[] | null}
 */
function controlsOf(ctx, kind, controls) {
  if (controls === undefined) return [];
  if (tooMany(ctx, controls, "/controls", CONTROLS.length, "controls") || !wantArray(ctx, controls, "/controls", "an array of control names")) return null;
  const seen = new Set();
  let ok = true;
  controls.forEach((c, i) => {
    const at = ptr("", "controls", i);
    if (!CONTROLS.includes(/** @type {never} */ (c))) ok = ctx.at(at, `expected one of ${CONTROLS.join(" ")}, got ${show(c)}`);
    else if (!CONTROL_KINDS[/** @type {keyof typeof CONTROL_KINDS} */ (c)].includes(kind)) {
      ok = ctx.at(at, `${c} is not available on chart ${kind}; it works on ${CONTROL_KINDS[/** @type {keyof typeof CONTROL_KINDS} */ (c)].join(", ")}`);
    } else if (seen.has(c)) ok = ctx.at(at, `${c} is listed twice`);
    seen.add(c);
  });
  return ok ? /** @type {string[]} */ (controls) : null;
}

/** What each control needs from every panel it switches. */
function needs(ctx, kind, controls, panels) {
  for (const c of controls) {
    const at = ptr("", "controls", controls.indexOf(c));
    if (c === "log-x" && kind === "lines" && panels.some((p) => p.data.x === undefined && !hasPointSeries(p.data))) {
      ctx.at(at, "log-x needs a numeric x axis in every view; give x or series points");
      return;
    }
    if (c === "labels" && panels.some((p) => p.data.labels !== true)) {
      ctx.at(at, "labels has nothing to toggle; set labels: true");
      return;
    }
    if ((c === "pareto" || c === "quadrant") && panels.some((p) => p.data[c] === undefined)) {
      ctx.at(at, `${c} has nothing to toggle; give ${c} a corner, e.g. "top-left"`);
      return;
    }
    if (c === "legend") {
      const names = (p) => (Array.isArray(p.data.series) ? p.data.series.map((s) => (isObject(s) ? s.name : "")) : []);
      const first = names(panels[0]);
      if (first.length < 2) {
        ctx.at(at, "legend needs at least 2 series to hide one");
        return;
      }
      if (panels.some((p) => names(p).join("\u0000") !== first.join("\u0000"))) {
        ctx.at(at, "legend needs the same series names, in the same order, in every view; one legend switches them all");
        return;
      }
    }
  }
}
