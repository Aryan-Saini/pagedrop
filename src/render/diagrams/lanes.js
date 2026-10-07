/**
 * `lanes` fence: process timelines with messages between them (the Erlang
 * message-passing slides). Each lane is a row of state segments over time;
 * a message is a dashed curve from a point on one lane to a point on another.
 *
 * Body:
 *   { title?, note?, compact?, axis?,
 *     lanes: [{ name, segs: [{ from, to, label?, state? }] }],
 *     msgs?: [{ from: { lane, t }, to: { lane, t }, label?, step? }] }
 *
 * @module render/diagrams/lanes
 */

import {
  Ctx, ptr, show, wantObject, wantArray, wantNonEmptyArray, wantNumber, wantText,
  optionalString, optionalBoolean, optionalEnum, unknownKeys,
} from "../schema/common.js";
import { INK, inkOf, markers, text, badge, svgOpen, figure, textW, n } from "./svg.js";

/** Segment states and the ink each one draws in. */
export const STATES = /** @type {const} */ (["busy", "send", "recv", "blocked", "idle"]);

/** @type {Record<State, string>} */
const STATE_INK = {
  busy: inkOf("c1", INK.rule),
  send: inkOf("c3", INK.rule),
  recv: inkOf("c7", INK.rule),
  blocked: inkOf("bad", INK.rule),
  idle: INK.rule,
};

/**
 * @typedef {typeof STATES[number]} State
 * @typedef {{ from: number, to: number, label: string, state: State }} Seg
 * @typedef {{ name: string, segs: Seg[] }} Lane
 * @typedef {{ lane: string, t: number }} End
 * @typedef {{ from: End, to: End, label: string, step?: number }} Msg
 * @typedef {{ title: string, note: string, compact: boolean, axis: string, lanes: Lane[], msgs: Msg[] }} LanesData
 */

const TOP_KEYS = ["title", "note", "compact", "axis", "lanes", "msgs"];

/** Validate a `lanes` fence body. */
export function validate(errors, block, file) {
  const ctx = new Ctx(errors, file, block.line, "lanes");
  if (!wantObject(ctx, block.data, "", "an object { lanes, msgs }")) return;
  const body = /** @type {Record<string, any>} */ (block.data);
  optionalString(ctx, body.title, "/title");
  optionalString(ctx, body.note, "/note");
  optionalString(ctx, body.axis, "/axis");
  optionalBoolean(ctx, body.compact, "/compact");
  unknownKeys(ctx, body, "", TOP_KEYS);

  /** @type {Set<string>} */
  const names = new Set();
  let t0 = Infinity, t1 = -Infinity;
  if (wantNonEmptyArray(ctx, body.lanes, "/lanes", "at least one lane")) {
    body.lanes.forEach((lane, i) => {
      const lp = ptr("", "lanes", i);
      if (!wantObject(ctx, lane, lp, "a lane { name, segs }")) return;
      unknownKeys(ctx, lane, lp, ["name", "segs"]);
      if (wantText(ctx, lane.name, ptr(lp, "name"), "a lane name")) {
        if (names.has(lane.name)) ctx.at(ptr(lp, "name"), `duplicate lane name ${show(lane.name)}; a message addresses a lane by name`);
        names.add(lane.name);
      }
      if (!wantNonEmptyArray(ctx, lane.segs, ptr(lp, "segs"), "at least one segment")) return;
      /** @type {{ from: number, to: number, k: number }[]} */
      const spans = [];
      lane.segs.forEach((seg, k) => {
        const sp = ptr(lp, "segs", k);
        if (!wantObject(ctx, seg, sp, "a segment { from, to, label, state }")) return;
        unknownKeys(ctx, seg, sp, ["from", "to", "label", "state"]);
        optionalString(ctx, seg.label, ptr(sp, "label"));
        optionalEnum(ctx, seg.state, ptr(sp, "state"), STATES);
        const okFrom = wantNumber(ctx, seg.from, ptr(sp, "from"));
        const okTo = wantNumber(ctx, seg.to, ptr(sp, "to"));
        if (!okFrom || !okTo) return;
        if (seg.from >= seg.to) {
          ctx.at(sp, `expected from < to, got from ${seg.from} and to ${seg.to}`);
          return;
        }
        spans.push({ from: seg.from, to: seg.to, k });
        t0 = Math.min(t0, seg.from);
        t1 = Math.max(t1, seg.to);
      });
      spans.sort((a, b) => a.from - b.from);
      for (let j = 1; j < spans.length; j++) {
        const a = spans[j - 1], b = spans[j];
        if (b.from < a.to) {
          ctx.at(ptr(lp, "segs", b.k), `overlaps segs/${a.k} (${a.from} to ${a.to}); segments in one lane must not overlap`);
        }
      }
    });
  }

  if (body.msgs === undefined || !wantArray(ctx, body.msgs, "/msgs", "an array of messages")) return;
  const extentKnown = t0 <= t1;
  body.msgs.forEach((msg, i) => {
    const mp = ptr("", "msgs", i);
    if (!wantObject(ctx, msg, mp, "a message { from, to, label }")) return;
    unknownKeys(ctx, msg, mp, ["from", "to", "label", "step"]);
    optionalString(ctx, msg.label, ptr(mp, "label"));
    if (msg.step !== undefined && !(Number.isInteger(msg.step) && msg.step >= 1)) {
      ctx.at(ptr(mp, "step"), `expected a positive integer, got ${show(msg.step)}`);
    }
    for (const end of /** @type {const} */ (["from", "to"])) {
      const ep = ptr(mp, end);
      const e = msg[end];
      if (!wantObject(ctx, e, ep, "an end { lane, t }")) continue;
      unknownKeys(ctx, e, ep, ["lane", "t"]);
      if (wantText(ctx, e.lane, ptr(ep, "lane"), "a lane name") && names.size && !names.has(e.lane)) {
        ctx.at(ptr(ep, "lane"), `no lane named ${show(e.lane)}; lanes: ${[...names].join(" ")}`);
      }
      if (wantNumber(ctx, e.t, ptr(ep, "t")) && extentKnown && (e.t < t0 || e.t > t1)) {
        ctx.at(ptr(ep, "t"), `expected a time from ${t0} to ${t1} (the lanes' extent), got ${e.t}`);
      }
    }
    if (isObj(msg.from) && isObj(msg.to) && typeof msg.from.lane === "string" && msg.from.lane === msg.to.lane) {
      ctx.at(mp, `expected two different lanes, got ${show(msg.from.lane)} at both ends`);
    }
  });
}

const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Fill defaults on a validated body.
 * @returns {LanesData}
 */
export function normalize(data) {
  return {
    title: data.title ?? "",
    note: data.note ?? "",
    compact: data.compact ?? false,
    axis: data.axis ?? "",
    lanes: data.lanes.map((l) => ({
      name: l.name,
      segs: l.segs.map((s) => ({ from: s.from, to: s.to, label: s.label ?? "", state: s.state ?? "busy" })),
    })),
    msgs: (data.msgs ?? []).map((m) => ({
      from: { lane: m.from.lane, t: m.from.t },
      to: { lane: m.to.lane, t: m.to.t },
      label: m.label ?? "",
      ...(m.step !== undefined ? { step: m.step } : {}),
    })),
  };
}

/** Target width of the whole diagram, lane names included. */
const WIDTH = 700;
const LANE_H = 58, BAR_H = 24, NAME_SIZE = 12, SEG_SIZE = 11.5, MSG_SIZE = 11;

/** @typedef {{ x0: number, y0: number, x1: number, y1: number }} Rect */

const hits = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Render a validated, normalized `lanes` block.
 * @param {{ data: LanesData }} block
 */
export function render(block) {
  const d = block.data;
  const segs = d.lanes.flatMap((l) => l.segs);
  const t0 = Math.min(...segs.map((s) => s.from)), t1 = Math.max(...segs.map((s) => s.to));
  const left = Math.max(...d.lanes.map((l) => textW(l.name, NAME_SIZE, true))) + 16;
  const right = 8;
  const unit = (WIDTH - left - right) / (t1 - t0);
  const xOf = (t) => left + (t - t0) * unit;
  const yOf = (i) => i * LANE_H + BAR_H / 2 + 4;
  const laneIx = new Map(d.lanes.map((l, i) => [l.name, i]));
  const mk = markers();

  let body = "";
  /** Segment labels and message labels already placed; a new message label must miss all of them. */
  /** @type {Rect[]} */
  const taken = [];

  // Message geometry first, so segment and message labels can both avoid every curve.
  const curves = d.msgs.map((m) => {
    const a = /** @type {number} */ (laneIx.get(m.from.lane)), b = /** @type {number} */ (laneIx.get(m.to.lane));
    const dir = b > a ? 1 : -1;
    const x1 = xOf(m.from.t), y1 = yOf(a) + dir * BAR_H / 2;
    const x2 = xOf(m.to.t), y2 = yOf(b) - dir * BAR_H / 2;
    const ym = (y1 + y2) / 2;
    /** Sample the cubic so labels can test against it. */
    const pts = Array.from({ length: 65 }, (_, k) => {
      const s = k / 64, u = 1 - s;
      return [x1 * (u ** 3 + 3 * u * u * s) + x2 * (3 * u * s * s + s ** 3), y1 * u ** 3 + 3 * ym * (u * u * s + u * s * s) + y2 * s ** 3];
    });
    return { m, dir, x1, y1, x2, y2, ym, pts };
  });

  /** Centre of a segment label: the bar's middle, or the nearest spot along it that no curve runs through. */
  const segLabelX = (x, w, lw, y) => {
    const free = (cx) => !curves.some((c) => c.pts.some(([px, py]) =>
      px > cx - lw / 2 - 3 && px < cx + lw / 2 + 3 && py > y - BAR_H / 2 && py < y + BAR_H / 2));
    const lo = x + 4 + lw / 2, hi = x + w - 4 - lw / 2, mid = x + w / 2;
    for (let off = 0; off <= w / 2; off += 6) {
      for (const cx of [mid - off, mid + off]) if (cx >= lo && cx <= hi && free(cx)) return cx;
    }
    return mid;
  };

  d.lanes.forEach((lane, i) => {
    const y = yOf(i);
    body += text(0, y + 4, lane.name, { cls: "node-label", mono: true, size: NAME_SIZE, anchor: "start" });
    body += `<line x1="${n(xOf(t0))}" y1="${n(y)}" x2="${n(xOf(t1))}" y2="${n(y)}" stroke="${INK.faint}"/>`;
    for (const s of lane.segs) {
      const x = xOf(s.from), w = (s.to - s.from) * unit, c = STATE_INK[s.state];
      body += `<rect x="${n(x + 0.65)}" y="${n(y - BAR_H / 2)}" width="${n(Math.max(w - 1.3, 1))}" height="${BAR_H}" rx="5" ` +
        `fill="${c}" fill-opacity="0.16" stroke="${c}" stroke-width="1.3"/>`;
      // A label that does not fit its bar is dropped rather than spilling onto a neighbour.
      const lw = textW(s.label, SEG_SIZE, true);
      if (s.label && lw + 8 <= w) body += text(segLabelX(x, w, lw, y), y + 4, s.label, { mono: true, size: SEG_SIZE });
    }
    taken.push({ x0: xOf(t0), y0: y - BAR_H / 2, x1: xOf(t1), y1: y + BAR_H / 2 });
  });

  for (const c of curves) {
    body += `<path d="M${n(c.x1)},${n(c.y1)} C${n(c.x1)},${n(c.ym)} ${n(c.x2)},${n(c.ym)} ${n(c.x2)},${n(c.y2)}" fill="none" ` +
      `stroke="${INK.bright}" stroke-width="1.3" stroke-dasharray="4 3" marker-end="url(#${mk.id(INK.bright)})"/>`;
  }

  for (const c of curves) {
    const { m } = c;
    if (!m.label && m.step === undefined) continue;
    const tw = (m.label ? textW(m.label, MSG_SIZE, true) : 0) + (m.step !== undefined ? 21 : 0);
    // Rows inside the gap on the sender's side, nearest the sender first.
    const gapRows = [13, 25].map((off) => c.y1 + c.dir * off);
    // The side the curve does not head toward first, then the other side.
    const sides = c.x2 >= c.x1 ? [-1, 1] : [1, -1];
    /** @type {{ x0: number, y0: number, x1: number, y1: number, side: number, base: number } | undefined} */
    let pick;
    search: for (const base of gapRows) {
      for (const side of sides) {
        for (const shift of [6, 18, 34]) {
          const x0 = side > 0 ? c.x1 + shift : c.x1 - shift - tw;
          const r = { x0, y0: base - 9, x1: x0 + tw, y1: base + 3 };
          if (taken.some((t) => hits(t, r))) continue;
          if (curves.some((o) => o.pts.some(([px, py]) => px > r.x0 - 2 && px < r.x1 + 2 && py > r.y0 - 1 && py < r.y1 + 1))) continue;
          pick = { ...r, side, base };
          break search;
        }
      }
    }
    // Every slot is crowded: fall back to the nearest one rather than dropping the label.
    pick ??= (() => {
      const base = gapRows[0], side = sides[0];
      const x0 = side > 0 ? c.x1 + 6 : c.x1 - 6 - tw;
      return { x0, y0: base - 9, x1: x0 + tw, y1: base + 3, side, base };
    })();
    taken.push(pick);
    let x = pick.x0;
    if (m.step !== undefined) {
      body += badge(x + 9, pick.base - 3.5, m.step, INK.bright);
      x += 21;
    }
    if (m.label) body += text(x, pick.base, m.label, { mono: true, size: MSG_SIZE, anchor: "start" });
  }

  let bottom = yOf(d.lanes.length - 1) + BAR_H / 2;
  if (d.axis) {
    const y = bottom + 10;
    // Integer ticks, thinned so neighbours stay at least 26px apart.
    const step = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((s) => s * unit >= 26) ?? 1000;
    body += `<line x1="${n(xOf(t0))}" y1="${n(y)}" x2="${n(xOf(t1))}" y2="${n(y)}" stroke="${INK.rule}"/>`;
    for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
      body += `<line x1="${n(xOf(t))}" y1="${n(y)}" x2="${n(xOf(t))}" y2="${n(y + 4)}" stroke="${INK.rule}"/>`;
      body += text(xOf(t), y + 16, t, { mono: true, size: 10.5 });
    }
    body += text(left + (WIDTH - left - right) / 2, y + 33, d.axis);
    bottom = y + 37;
  }

  const box = { x: -4, y: 0, w: WIDTH + 8, h: bottom + 6 };
  const label = d.title || `process lanes: ${d.lanes.map((l) => l.name).join(", ")}`;
  const svg = svgOpen(box, { label, compact: d.compact }) + mk.defs() + body + "</svg>";
  return figure(svg, d.title, d.note);
}
