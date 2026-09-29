---
name: html-communication
description: When communicating a plan, spec, write-up, findings or UI mocks as a readable document, or when user says "create a doc", use skill.
metadata:
  requires: "npx, and postplan-aryan auth in ~/.postplan (see SETUP.md in Aryan-Saini/postplan-convex)"
---

# HTML Communication

## 1 · When to use, and the default path

For a plan, spec, write-up, findings, summary, report, comparison or set of UI
mocks meant to be read as a document. Not for HTML that ships in a product.
**Write Markdown. Do not write HTML.**

```bash
npx postplan-aryan@latest render plan.md    # optional: preview plan.html first
npx postplan-aryan@latest upload plan.md    # renders, publishes, prints the URL
```

`upload plan.md` renders to `plan.html` and publishes that, but remembers the
draft under `plan.md`: re-upload the same `.md` and the URL stays, the version
bumps. The renderer owns typography, colour, spacing, chart geometry and the
SVG; you own words, structure and numbers. **Never write CSS, never
hand-position an SVG, never set a font or a colour.** Section 10 is the one
exception.

## 2 · Document format (always applies)

Frontmatter, the lead, then sections.

```markdown
---
title: Q3 warehouse plan
byline: Jane Doe
date: Sep 22, 2026
status: On track
---

Pick-to-ship is 41 hours against a 24 hour target, and the whole gap is putaway.
```

Those four keys become the byline chips under the title. Two optional keys set
the browser tab only: `tab:` (the `<title>`, max 80 chars; `title:` stays the h1)
and `icon: black | indigo` (favicon, default `black`). No other keys are allowed.
A status reading blocked/critical/fail turns the dot red,
risk/warn/late amber, anything else green.

**The lead is the answer:** the first paragraph says what the reader came for,
not a preamble, a scope note or a summary of what follows.

**Headings.** `##` is a section and builds the contents strip, so a document
wants three to eight. `###` is a subsection, `####` a small sans label. Never
skip a level; `#` is unnecessary, the frontmatter title is the `h1`.

**Lists.** Ordered nests `1.` → `a.` → `i.`, bulleted disc → circle → square,
both by two-space indent, tasks are `- [ ]` and `- [x]`. Bullets carry parallel
items only; anything with a because-clause is a paragraph.

**Table, chart or sentence.** Two or three numbers are a sentence. Six or fewer
with no time axis, or values a reader looks up one at a time, are a table. Five
or more with a shape (a trend, a ranking, a split) are a chart. Never both for
the same numbers.

**Inline marks.** `**bold**` `*italic*` `~~struck~~` `==highlight==`
`++underline++` `` `code` `` `H~2~O` `r^2^` `[text](url)` `[^1]` `$E = mc^2$`.
**Containers**, closed with `:::`: `::: center`, `::: right`, `::: subtext` (a
step down in size, not colour), `::: columns` (blank-line-separated paragraphs
become columns, collapsing under 520px).

**Voice.** Sentence case, short sentences, no em dashes, no marketing, no "it's
worth noting". Sources and caveats go last, under `## Sources`. **No grey text.
Every glyph is white; hierarchy is size and weight.** Figure notes are
fragments, not sentences: "September is partial", not "Note that September is
partial through the 22nd and should be read with care."

## 3 · Need a chart

One fence per chart. Every kind takes the same envelope (`title`, `note`,
`caption`, `format`) plus its own data keys. Keep data inline up to roughly 50
rows; past that put the JSON in a file beside the document and point at it with
`"src": "rows.json"`. At most **8 series or parts**; fold the tail into "Other"
or use `small-multiples`. `format` is `int` `compact` `usd` `pct` `ms`, where
`pct` takes a fraction (`0.031` renders `3.1%`). Tones: `good warn bad flat`.

Value labels on `delta`, `waterfall` and `funnel` take the mark's tone (green up, red down, honouring `higherIsBetter`); a series `"tone":"good|bad|warn|flat"` colours its line and end label. Ticks and axis labels stay white.

````markdown
```chart columns
{"title":"Orders shipped","note":"September is partial","format":"int",
 "labels":["Jul","Aug","Sep"],"values":[812,904,1130]}
```
````

The other thirteen kinds take that fence and envelope with this body:

```jsonc
// bars / funnel / share: a ranking, an ordered drop-off, a strip instead of a pie
{"labels":["Plans","Findings","Other"],"values":[412,298,108]}
// delta:     signed change against zero; higherIsBetter flips the colours
{"labels":["Validate","Serve"],"values":[-3,26],"higherIsBetter":false}
// waterfall: a bridge; totals lists the label indices that are totals
{"labels":["Aug","New","Churn","Sep"],"values":[168,34,-41,121],"totals":[0,3]}
// lines:     a trend; area fills under it, zeroFloor pins the axis to 0
{"labels":["W1","W2","W3"],"series":[{"name":"p50","values":[284,303,297]}],"area":true}
// grouped / stacked / small-multiples: same labels + series shape as lines
{"labels":["Q3","Q4"],"series":[{"name":"Created","values":[42,51]},{"name":"Updated","values":[18,22]}]}
// whisker:   lo <= mid <= hi, one of each per label
{"labels":["Serve"],"mid":[96],"lo":[58],"hi":[1340]}
// heatmap:   values is one row of numbers per row label
{"rows":["Mon","Tue"],"cols":["00","12"],"values":[[1,14],[0,16]]}
// scatter:   points with an optional bubble size
{"xTitle":"Minutes","yTitle":"KB","points":[{"x":24,"y":102,"size":9,"label":"Plans"}]}
// schedule:  ISO dates, ticks fall on month boundaries
{"tasks":[{"label":"Convex backend","start":"2026-08-14","end":"2026-08-29","done":true}]}
```

## 4 · Need a stat tile or a hero number

`stats` is a dense grid, `hero` one big centred number, same body either way:
tiles of `k` label, `v` number, `as` as-of line, `delta` change text, `tone`,
`spark` (two or more points), `meter` `{max}`.

````markdown
```hero
[{"k":"Net burn","v":412000,"format":"usd","as":"Aug 2026","delta":"-6.0% vs July","tone":"good"}]
```

```stats
[{"k":"Documents","v":1284,"format":"int","delta":"+18.4% vs August","tone":"good","spark":[61,78,96,142,168,121]},
 {"k":"Largest","v":486,"format":"int","delta":"95% of the cap","meter":{"max":512}}]
```
````

## 5 · Need code or a diff

A plain fence with a language is highlighted. `file=` or `title=` adds a header,
the bare word `lines` numbers them. Languages: `ts js py sh sql rust go json
yaml html xml css md toml` plus the usual aliases; anything else renders
escaped.

````markdown
```ts file=src/upload.ts lines
export async function upload(html: string) {
  return post("/api/uploads", { html });
}
```

```diff title="Add a CSP to served drafts"
-  "Cache-Control": "private, max-age=30",
+  "Content-Security-Policy": "default-src 'none'"
```
````

## 6 · Need a diagram

Two layouts, drawn to computed geometry. Mermaid does not render here.

````markdown
```flow
{"title":"Publish path","note":"Rejection precedes storage",
 "cols":[[{"id":"cli","label":"CLI upload","shape":"round"}],
         [{"id":"val","label":"Validate","shape":"diamond"}],
         [{"id":"s3","label":"S3","shape":"store"},{"id":"err","label":"400 rejected","tone":"bad"}]],
 "edges":[{"from":"cli","to":"val"},{"from":"val","to":"s3","label":"ok"},
          {"from":"val","to":"err","label":"reject"}]}
```

```sequence
{"title":"Upload and read","actors":["Agent","Convex","S3"],
 "msgs":[{"from":"Agent","to":"Convex","label":"POST /api/uploads"},
         {"from":"Convex","to":"S3","label":"PUT html"},{"from":"S3","to":"Convex","label":"200","dashed":true}]}
```
````

Shapes are `box` `round` `diamond` `store`. Node ids are unique across all
columns and every edge endpoint must name one; sequence endpoints must name a
declared actor.

## 7 · Need a formula

`$…$` inline, `$$…$$` on its own lines, or a `math` fence. All three become
MathML through temml: no image, no bundle, selectable text.

> **The `$` heuristic.** A `$` followed by a digit or a space is money or prose,
> never math, so `$412k` and `$ 5` stay literal. A formula that *starts* with a
> digit needs `$$…$$` or a `math` fence.

```markdown
Half-life is $t_{1/2} = \frac{\ln 2}{\lambda}$, and the p95 bound is

$$
p_{95} = \mu + 1.645\,\sigma
$$
```

Notation: `\frac{a}{b}` `\sqrt{x}` `x^{2}` `x_{i}` `\sum_{i=1}^{n}` `\int_0^\infty`
`\alpha \beta \mu \sigma \lambda \Delta` `\times \cdot \le \ge \ne \approx`
`\text{bytes}` `\mathrm{kg}`.

## 8 · Need an image, a screenshot, a slideshow or a video

The document carries no local files. **Publish the asset first with the
`file-upload` skill**, then use the https URL it returns; that URL is public and
permanent, so treat it like a PR screenshot. Publish with `postplan asset` and paste the URL. The title `zoom` makes a figure a
click-to-enlarge lightbox, and the alt text is the caption.
Every image, slide, poster and clip src must be an https URL from `file-upload` or a `data:` URI; relative paths do not render and fail the build.

```markdown
![Dashboard after the S3 move · captured Sep 21](https://…/dash.png "zoom")
```

````markdown
```slides
[{"src":"https://…/1.png","caption":"The list view before the change"},
 {"src":"https://…/2.png","caption":"After"}]
```

```video
{"src":"https://…/clip.mp4","poster":"https://…/poster.png","caption":"Upload flow, 0:42"}
```
````

Always mp4, never webm, which iPhone Safari will not play, and always a poster
frame (`ffmpeg -ss <seconds> -i clip.mp4 -frames:v 1 poster.png`). Never a bare
link instead, which reads as though there is no video.

If an image fails at view time the reader sees a labelled panel with Open and Copy; publish with file-upload so links never expire.

**Need a download** (a build, an archive, an export): a `file` fence, one object or a list.
Publish with `postplan asset` and paste the URL.
Use it for anything the reader should download; set `expires` when the link will stop working
and the card shows the date, a countdown inside 48 hours, and an expired state after.

```file
[{"src":"https://…/acme-1.4.2.apk","name":"acme-1.4.2.apk","size":48213333,
  "expires":"2026-09-26T21:00:00Z","note":"Internal build, Android 12+"},
 {"src":"https://…/export.zip","name":"export.zip","size":3100000}]
```

The type icon, the `48.2 MB · APK · Android package` line and Download / Open / Copy come
from the name; `kind` overrides the extension. A signed S3 URL gets its expiry read automatically.

## 9 · Need a callout, a toned table, a timeline or a footnote

```markdown
> [!NOTE] Context
> A rule and a label, not a tinted card.
```

Tones are `NOTE` `GOOD` `WARN` `CRITICAL`, with the GitHub aliases (`TIP`,
`IMPORTANT`, `CAUTION`, `DANGER`) mapping onto them; the text after the tag is
the label. A table cell prefixed `good:` `warn:` `bad:` `flat:` takes that
colour and the prefix is stripped. Right-align numbers with `---:`.

```markdown
| Stage | p95 (ms) | Error rate |
| --- | ---: | ---: |
| Serve | 1,340 | bad:4.8% |
```

````markdown
```timeline
[{"when":"Aug 12","what":"Forked postplan","state":"done","note":"Vendored unmodified."},
 {"when":"Sep 22","what":"This page","state":"now"},{"when":"Next","what":"Fold into the skill"}]
```
````

`when` is display text, not a date: a timeline reads in the order you write it,
unlike `chart schedule`, drawn to scale. States: `done` `now` `next`. Footnotes
are `[^1]` in the text and `[^1]: The note.` on its own line, collected at the
end.

## 10 · Need something the renderer has no block for

An `html` fence is emitted verbatim and inherits the document's styling. Use
the shell's class names rather than inline styles: `mocks` `mock`
`mock-head` `mock-body` `mock-big` `mock-row` (UI mock frames), `pair` + `lbl`
(before/after), `img` `img.narrow` `img.plain` `fig` `fig-title` `fig-note`
`fig-cap` `fig-scroll`, `dl.spec` + `dt`/`dd`, `stats` `stat` `k` `v` `d`,
`hero`, `note` `note.good` `note.warn` `note.critical` + `tag`, `small`
`subtext` `center` `right` `columns`, `tbl-wrap` `table.full` `num` `t-good`
`t-warn` `t-bad` `t-flat`, `key` `swatch` `legend` `meter` `meter-track`
`meter-fill` `meter-head`.

**Colour inside a fence.** Colour in mocks means something (up, down, a series);
never decoration. These classes work only inside an `html` fence (prose stays
white) and use only the palette tokens:

| Class | Colour / effect | Example |
|---|---|---|
| `up` `good` · `down` `bad` `critical` | text `#0ca30c` · `#d03b3b` | `<span class="delta up">+2.1%</span>` |
| `warn` · `serious` | text `#fab219` · `#ec835a` | `<span class="warn">Degraded</span>` |
| `c1`…`c8` | text in series colour `--s1`…`--s8` | `<b class="c3">Series C</b>` |
| `bg-c1`…`bg-c8` `bg-up` `bg-down` `bg-warn` | 14% tinted wash, text unchanged | `<div class="mock-row bg-down">…</div>` |
| `dot-c1`…`dot-c8` `dot-up` `dot-down` `dot-warn` | 8px dot before the text | `<span class="dot-c1">NVDA</span>` |
| `delta` | 600 weight, tabular nums; pair with a tone | `<span class="delta down">−0.8%</span>` |
| `pill` | the byline chip look; pair with `bg-*` + a tone | `<span class="pill bg-up up">Healthy</span>` |
| `ticker` + `sym` `px` `delta` | stock-list row, hairline between rows | `<div class="ticker"><span class="sym">NVDA</span><span class="px">$132.40</span><span class="delta up">+2.1%</span></div>` |
| `mock-grid` (`.three`) | 2 (or 3) column hairline tile grid | `<div class="mock-grid"><div>…</div><div>…</div></div>` |

Write the sign yourself (`+2.1%`, `−0.8%`); the class only colours it. For a
one-off colour no class covers, inline `style="color:#hex"` passes the upload
policy; take the hex from the palette.

````markdown
```html
<dl class="spec">
  <dt>Size cap</dt><dd>512 KB per document, enforced server side</dd>
</dl>
```
````

The fence runs through the upload policy at render time, so a rejected tag fails
the render rather than the publish. Never include external or module scripts,
inline event handlers, `javascript:` URLs, forms, frames, embeds, objects, meta
refresh, linked stylesheets, secrets or filesystem paths.

**Hand-write a whole `.html` only when the document *is* the mock:** full-page
UI variants where the page's own look is the subject. Then it is one file, true
black, white text, no decorative chrome, responsive, variants labelled
`A`/`B`/`C`, the same file across iterations so the URL stays stable. Every
other document is Markdown.

The sandbox: an inline classic script runs, but a CSP blocks `fetch`, frames,
forms, workers and popups; storage is **not** blocked. Keep a scripted page
useful with JavaScript off. In a script-free file give external links
`target="_blank" rel="noopener noreferrer"`; if any script exists, omit it.

## 11 · When the render fails

Nothing is written and every problem prints at once, one per line:

```
plan.md:41 chart lines: /series/0/values expected 8 numbers to match labels, got 7
plan.md:80 unknown block "chart pie"; kinds: columns bars lines …
plan.md:12 frontmatter: unknown frontmatter key "author"; keys: title byline date status tab icon
```

`file:line block: /json/pointer message`. The pointer walks the fence's JSON
body, so `/series/0/values` is the first series' values array. Read it literally
and fix that key: the message names the shape expected and what it got. A JSON
syntax error points at the offending byte's line, not at the fence.

## 12 · Publish and report back

Uploading is the point of this skill: every document created or updated with it
is published. Do not ask for separate permission and never stop at the local file. Write `plan.md`, run
`npx postplan-aryan@latest upload plan.md`, report the local path and the URL.
Re-upload the same `.md` to update that URL and bump the version; `--new` only
for a genuinely separate draft. Never open a browser or claim the document is
hosted before the upload succeeds, and do not verify in a browser unless asked.
Every upload is kept; `<url>/v/<n>` opens an earlier version and `npx postplan-aryan@latest versions <url>` lists them.

Report the document link and nothing else. Uploaded images and videos belong
inside the document, so do not repeat their URLs in chat. Link as short
markdown: never a bare URL, never a `/raw` variant, no emoji prefix. Wrong:
`📄 Doc (updated): https://….convex.site/d/pr55-hur21q1v/raw`. Right:
`[Doc](https://<deployment>.convex.site/d/pr55-hur21q1v)`.
