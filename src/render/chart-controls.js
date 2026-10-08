/**
 * Charts a reader can switch: `views` (tabs over one chart slot) and
 * `controls` (log toggles, sort, annotation layers, series and a data table
 * behind a settings icon).
 *
 * Everything is pre-rendered. Each view, times each log and sort state, is its
 * own SVG panel; switching shows one panel and hides the rest. The state lives
 * in real form controls (radios for the tabs, checkboxes for the settings and
 * the legend) and the shell's `:has()` rules read it, so the controls work
 * with scripts blocked. `CHART_SCRIPT` only adds the niceties: Reset, and
 * closing the settings on an outside click or Escape.
 *
 * @module render/chart-controls
 */

import { TONE_INK, annotationKeys, chartParts, compact, esc, formatter, keyMark, renderChart, seriesColor } from "./charts.js";
import { panelsOf } from "./schema/chart.js";
import { normalizeChart } from "./schema/index.js";

/** @typedef {import("./ir.js").ChartBlock} ChartBlock */

/** True when a chart body asks for tabs or switches. */
export const isControlled = (data) =>
  !!data && typeof data === "object" && (/** @type {any} */ (data).views !== undefined || /** @type {any} */ (data).controls !== undefined);

/**
 * Render one `chart` block: the plain figure, or the switchable one when the
 * body carries `views` or `controls`. Validated, normalized input only.
 *
 * @param {ChartBlock} block
 * @returns {string}
 */
export function renderChartBlock(block) {
  return isControlled(block.data) ? controlledChart(block) : renderChart(block);
}

/**
 * Radio groups need a name unique in the document. A fence line is not (an IR
 * may give two blocks the same line), so names are numbered in render order;
 * `render()` resets the count so the same document always gets the same names.
 */
let chartSeq = 0;
export const resetChartIds = () => { chartSeq = 0; };

/** Popover rows, in the order the menu lists them. */
const MENU = /** @type {const} */ ([
  ["log-x", "Log x axis"],
  ["log-y", "Log y axis"],
  ["sort", "Sort by value"],
  ["labels", "Point labels"],
  ["pareto", "Pareto frontier"],
  ["quadrant", "Quadrant"],
  ["table", "Table"],
]);

/** A sliders glyph for the settings button. */
const SETTINGS_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 4h14M1 8h14M1 12h14"/>` +
  `<circle cx="5" cy="4" r="1.6"/><circle cx="11" cy="8" r="1.6"/><circle cx="7" cy="12" r="1.6"/></svg>`;

/** @param {ChartBlock} block */
function controlledChart(block) {
  const d = /** @type {Record<string, any>} */ (block.data);
  const kind = block.kind;
  const controls = /** @type {string[]} */ (d.controls ?? []);
  const has = (c) => controls.includes(c);
  // Views are merged after normalize ran on the base, so each panel gets the same defaults again.
  const panels = panelsOf(d).map((p) => ({ ...p, data: normalizeChart(kind, p.data) }));
  const views = d.views ?? [];
  const id = `cx${++chartSeq}`;

  const body = [];
  for (const p of panels) {
    const orders = has("sort") ? [["as", p.data], ["val", byValue(p.data)]] : [["", p.data]];
    for (const [o, data] of orders) {
      const parts = chartParts(() => renderChart({ ...block, data }), has("legend"));
      const attrs = `data-v="${p.v}"` + (p.x ? ` data-x="${p.x}"` : "") + (p.y ? ` data-y="${p.y}"` : "") + (o ? ` data-o="${o}"` : "");
      body.push(`<div class="cv" ${attrs}>${has("legend") ? "" : parts.legend}<div class="fig-scroll">${parts.svg}</div>` +
        (parts.note ? `<div class="fig-note">${esc(parts.note)}</div>` : "") + `</div>`);
    }
  }
  if (has("table")) {
    // One table per view; the scales and sort order do not change the numbers.
    for (const p of panels) {
      if (p === firstOfView(panels, p.v)) body.push(`<div class="cv" data-t data-v="${p.v}">${table(kind, p.data)}</div>`);
    }
  }

  const tabs = views.length
    ? `<div class="cx-tabs" role="radiogroup" aria-label="View">` + views.map((v, i) =>
      `<label><input type="radio" class="ct" name="${id}" value="${i}"${i ? "" : " checked"}><span>${esc(v.label)}</span></label>`).join("") + `</div>`
    : "";

  const first = panels[0].data;
  const rows = MENU.filter(([c]) => has(c)).map(([c, text]) => {
    const on = c === "log-x" ? panels[0].x === "log" : c === "log-y" ? panels[0].y === "log" : c !== "sort" && c !== "table";
    return `<label class="cx-row"><span>${text}</span><input type="checkbox" class="co" data-k="${c}"${on ? " checked" : ""}></label>`;
  });
  const menu = rows.length
    ? `<details class="cx-set"><summary aria-label="Chart settings">${SETTINGS_ICON}</summary>` +
      `<div class="cx-pop">${rows.join("")}<button type="button" class="cx-reset" hidden>Reset</button></div></details>`
    : "";
  const head = d.title || menu ? `<div class="cx-hd">${d.title ? `<div class="fig-title">${esc(d.title)}</div>` : ""}${menu}</div>` : "";

  return `<figure class="fig cx">${head}${tabs}${has("legend") ? sharedLegend(kind, first) : ""}${body.join("")}</figure>`;
}

/** The first panel of view `v`: its authored scales, which is the one its table describes. */
const firstOfView = (panels, v) => panels.find((p) => p.v === v);

/**
 * One legend for every panel, each key a checkbox that hides its series in
 * all of them. The validator has checked that every view names the same series.
 */
function sharedLegend(kind, d) {
  const series = /** @type {{ name: string, tone?: string, dashed?: boolean }[]} */ (d.series);
  const mark = kind === "lines" ? "line" : "bar";
  const keys = series.map((s, i) =>
    `<label class="key"><input type="checkbox" class="cl" value="${i}" checked>` +
    `${keyMark(mark, TONE_INK[s.tone] ?? seriesColor(i), s.dashed === true)}${esc(s.name)}</label>`).join("");
  const extra = kind === "scatter" ? annotationKeys({ pareto: d.pareto ?? "", quadrant: d.quadrant ?? "" }) : "";
  return `<div class="legend cx-legend">${keys}${extra}</div>`;
}

/** Bars or columns reordered largest first, with any per-bar tones following their bar. */
function byValue(d) {
  const order = d.labels.map((_, i) => i).sort((a, b) => d.values[b] - d.values[a]);
  const out = { ...d, labels: order.map((i) => d.labels[i]), values: order.map((i) => d.values[i]) };
  if (Array.isArray(d.tones)) out.tones = order.map((i) => d.tones[i]);
  return out;
}

/**
 * The chart's numbers as a plain table: a row per label (or per point), a
 * column per series. Formatted with the chart's own `format`.
 */
function table(kind, d) {
  const fmt = formatter(d.format);
  /** @type {string[]} */ let head;
  /** @type {string[][]} */ let rows;
  const series = /** @type {any[]} */ (d.series ?? []);
  if (kind === "scatter") {
    const x = d.xTitle || "x", y = d.yTitle || "y";
    if (series.length) {
      const named = series.some((s) => s.points.some((p) => p[2]));
      head = ["Series", ...(named ? ["Point"] : []), x, y];
      rows = series.flatMap((s) => s.points.map((p) => [s.name, ...(named ? [p[2] ?? ""] : []), fmt(p[0]), fmt(p[1])]));
    } else {
      const sized = d.points.some((p) => p.size);
      head = ["", x, y, ...(sized ? ["Size"] : [])];
      rows = d.points.map((p) => [p.label ?? "", fmt(p.x), fmt(p.y), ...(sized ? [compact(p.size ?? 0)] : [])]);
    }
  } else if (kind === "lines" && series.some((s) => Array.isArray(s.points))) {
    head = ["Series", d.xTitle || "x", d.yTitle || "y"];
    rows = series.flatMap((s) => s.points.map((p) => [s.name, compact(p[0]), fmt(p[1])]));
  } else if (kind === "lines" || kind === "grouped" || kind === "stacked") {
    const count = Array.isArray(d.x) ? d.x.length : d.labels.length;
    head = [d.xTitle || "", ...series.map((s) => s.name)];
    rows = Array.from({ length: count }, (_, i) =>
      [d.labels?.[i] ?? compact(d.x[i]), ...series.map((s) => fmt(s.values[i]))]);
  } else {
    head = ["", "Value"];
    rows = d.labels.map((l, i) => [l, fmt(d.values[i])]);
  }
  // Every column after the leading text ones (series, point, label) holds numbers.
  const text = head.length - (kind === "scatter" || head[0] === "Series" ? (head.at(-1) === "Size" ? 3 : 2) : head.length - 1);
  const tr = (cells, tag) => `<tr>${cells.map((c, i) => `<${tag}${i >= text ? ` class="num"` : ""}>${esc(c)}</${tag}>`).join("")}</tr>`;
  return `<div class="tbl-wrap"><table><thead>${tr(head, "th")}</thead><tbody>${rows.map((r) => tr(r, "td")).join("")}</tbody></table></div>`;
}

/**
 * Reveals Reset once any setting differs from the author's default, and closes
 * an open settings menu on a click outside it or Escape. The switching itself
 * is CSS and needs none of this.
 */
export const CHART_SCRIPT = `(() => {
  for (const f of document.querySelectorAll(".cx")) {
    const reset = f.querySelector(".cx-reset");
    if (!reset) continue;
    const inputs = f.querySelectorAll("input.co, input.cl");
    const sync = () => { reset.hidden = ![...inputs].some((i) => i.checked !== i.defaultChecked); };
    f.addEventListener("change", sync);
    reset.addEventListener("click", () => { for (const i of inputs) i.checked = i.defaultChecked; sync(); });
  }
  const close = (keep) => { for (const d of document.querySelectorAll("details.cx-set[open]")) if (d !== keep) d.open = false; };
  document.addEventListener("click", (e) => close(e.target instanceof Element ? e.target.closest("details.cx-set") : null));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(null); });
})();`;
