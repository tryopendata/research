---
paths:
  - "*"
---

Make sure these skills are loaded: openchart, opendata-api, data-journalist, data-science. Load all references within openchart and opendata-api.

## When generating a report

1. Start the dev server if not already running: `bun run dev`
2. **Dispatch research agents in parallel.** Use the custom agents in `.claude/agents/` for data work. Launch as many independent agents concurrently as possible.

   | Agent | Model | Use for |
   |-------|-------|---------|
   | **data-researcher** | Sonnet | Dataset discovery, schema evaluation, multi-step query building, cross-dataset SQL joins, data quality checks. Knows the full OpenData API including SQL endpoint. Dispatch one per dataset or research question. |
   | **data-fetcher** | Haiku | Fetching data from known endpoints, extracting stats from large responses, simple column inspection. Use when the dataset and query are already known. Fastest option for mechanical work. |
   | **Main thread** | Opus | Narrative writing, chart spec design, editorial decisions, cross-dataset synthesis, report structure. Reserve for work that benefits from strongest reasoning. |

   **Dispatch pattern:** Fan out `data-researcher` agents to discover and query datasets in parallel. If a researcher identifies a dataset that just needs a simple fetch or stat extraction, it can note that for the main thread to dispatch a `data-fetcher` instead. Collect all results back to the main thread for narrative synthesis and chart design.

   **Verification is mandatory.** After any data-researcher agent returns numbers, run at least one independent verification query from the main thread before embedding data in a chart. Research agents can hallucinate plausible-looking values. If a researcher returns data you can't verify via API, do not use it.
3. Write the report to `src/reports/<slug>.mdx`
4. **Pre-render check.** Before previewing, grep the file for known crash patterns:
   - Mixed units on the same axis (%, $, counts sharing one scale)
   - `".0f%"` format on pre-computed percentages (will multiply by 100 again)
5. Preview with playwright-cli: `playwright-cli open http://localhost:5173/<slug>` then `playwright-cli screenshot`
6. **Visual QA checklist** after screenshot:
   - All charts render (no error boundaries or grey placeholders)
   - No text collisions (endpoint labels, annotations, axis labels)
   - Numbers are formatted (no raw 1000000, labels not truncated)
   - Legend shows all series (no "+1 more" overflow)
   - Bars/dots are visible (no invisible bars from mixed units)
   - Annotations are fully visible (not clipped at edges)

## Report conventions

- Reports live in `src/reports/<slug>.mdx`
- Files starting with `_` are ignored (e.g., `_template.mdx`)
- The slug in the filename becomes the URL path
- Every report needs `export const meta = { title, date, description, tags }`
- See `src/reports/_template.mdx` for the skeleton with design principles and chart examples
- Chart titles should be assertions, not labels ("GDP surpassed $31T" not "GDP Over Time")
- Each Figure needs an `alt` describing the chart
- Put data source attribution in `chrome.source` inside the Chart spec, not in `<Figure caption="">`. Only use Figure caption for context not already in the chart (e.g., methodology notes)
- Aim for 5-7 charts per report. Fewer than 4 usually means the report isn't deep enough. More than 8 usually means you're not editing enough.

## Visualization design (non-negotiable)

Follow the `openchart` skill's design philosophy references for every chart. Load `color-strategy.md`, `editorial-writing.md`, and `design-review.md` when writing chart specs.

- **Color checkpoint before every chart.** Uniform/mono-color charts are never acceptable when the data has narrative variation.
- **Establish a report color palette early.** After the first 2-3 charts, document the palette in an MDX comment at the top of the file and reference the openchart skill's color-strategy.md Ready-Made Palettes for starting points. All subsequent charts draw from the documented palette. Common semantic roles: primary entity gets an accent color, comparison/peers get gray, positive = green, negative = red. Don't let each chart pick colors independently.
- **Annotate the story.** Mark inflection points, anomalies, crossovers, and notable periods. Reference lines at meaningful thresholds. Label outliers directly. Budget: 0-3 per chart.
- **Line charts get dots by default.** Use `mark: { type: "line", point: true, interpolate: "monotone" }` so each data point is visible. Only omit `point: true` for very dense time series (50+ data points per series) where dots would overlap.
- **Pick ONE label identification method per chart.** Follow the legend-vs-labels decision framework in the openchart skill's design-review.md. Never show both legend AND endpoint labels on the same chart. For 2-series line charts, use endpoint labels + hide legend. For 3+ series, use legend + hide endpoint labels.
- **Horizontal bar charts must be readable without tracing to the y-axis.** The default bar labels only show the value, forcing readers to scan left to identify what each bar represents. For bars where the y-axis label is far from the bar end (long bars, many categories), bake the category name into the data value field so the label includes both (e.g., `{ country: "United States", label: "United States 1,200", value: 1200 }`), or keep bars short enough that the y-axis label is visually adjacent. When bars are invisible (e.g., zero or near-zero values), this problem is amplified because the remaining bars lose their spatial association with axis labels.
- **Run the 5-second test.** Cover the title, look at the chart. Can you state the takeaway?
- **Always set `tickCount: 5` on quantitative y-axes.** The engine defaults to showing only the domain endpoints (e.g., 0 and 50), which makes it impossible to read intermediate values. Add `axis: { tickCount: 5 }` to every quantitative y-encoding. The engine treats this as a suggestion and picks clean round values nearby. For compact charts (<400px), use `tickCount: 3` or `4`.
- **Format large numbers with SI suffixes.** Use `"~s"` (or `"$~s"` for currency) in `axis.format` and `labels.format` so 100,000 displays as `100k`, 1,500,000 as `1.5M`, 2,000,000,000 as `2B`, etc. Raw unformatted numbers like `1000000` are never acceptable on axes or labels. For non-round values where `~s` produces ugly decimals (e.g., 60,420 → `60.4k`), round the data first or use `"$,.0f"` / `",.0f"` with comma separators instead.
- **Diverging bar charts (positive + negative values) must NOT use `color` encoding with a categorical field.** Using `color: { field: "zone", type: "nominal" }` on a bar chart triggers stacked bar logic, which breaks negative bar rendering. Instead, use **conditional color encoding** to color bars by sign: `color: { condition: { test: { field: "value", gte: 0 }, value: "#4CAF50" }, value: "#F44336" }`. Add a refline at x=0 for the zero baseline. This renders each bar individually with the correct color based on its value.
- **Prefer line charts over stacked area for comparing series.** Stacked area charts make it hard to read individual series because each area's baseline shifts. The boundary lines between stacked areas create visual noise (e.g., a grey line cutting through a red area). Use stacked area only when part-to-whole composition is the story. When comparing trajectories of independent series (e.g., fentanyl vs other opioid deaths), use separate lines instead.
- **Scatter plot tooltips.** Use multi-field tooltip arrays on scatter plots where dots represent named entities: `tooltip: [{ field: "country", type: "nominal" }, { field: "gdp", type: "quantitative" }]`. This shows both the entity name and values on hover. Always include the identifying field (country/entity name) as the first tooltip entry.
- **Use lollipop marks for narrow-range categorical data.** When data doesn't include zero (e.g., happiness scores 6.0-7.8, temperature anomalies 0.8-1.2), `mark: "lollipop"` is better than bars because the zero-baseline bar requirement makes visual differences invisible. Lollipop marks accept nominal/ordinal on y-axis and quantitative on x-axis.
- **Every claim must have a chart.** If a section makes a data-backed assertion (e.g., "tuition costs have tripled"), there must be a chart proving it. Prose-only data claims without visual evidence are not acceptable. If a section header is an assertion, the chart that follows should make that assertion visually obvious.
- **Show inflation baselines on cost charts.** When charting a cost that has increased over time (healthcare spending, tuition, housing prices, etc.), add a second "inflation-adjusted baseline" series showing what the cost *would* have been if it had only kept pace with overall CPI. This makes the real increase visually obvious: the gap between the actual line and the inflation baseline IS the story. Use `seriesStyles` to make the baseline dashed/muted (e.g., `{ "If inflation only": { lineStyle: "dashed", strokeWidth: 1.5, opacity: 0.6 } }`). Without this baseline, a chart showing "$8k to $16k" could just be inflation. With it, the reader sees how much of the increase is real vs nominal.
- **Close with a synthesis chart.** The conclusion section should include a final visualization that synthesizes the report's key finding into one image. This isn't a repeat of an earlier chart. It's the "if you only see one chart" chart that distills the entire narrative. Examples: a before/after comparison bar, a single diverging chart showing the net effect, a small-multiples summary, or a simple big-number callout. The closing chart should be the one a reader screenshots and shares. If the conclusion is prose-only, you've missed the most impactful placement in the entire report.

## Chart spec gotchas (learned from production QA)

These are patterns that passed code review but broke at render time. Check these before writing any chart spec:

- **Use lollipop for narrow-range categorical rankings.** When values don't include zero (happiness 6-8, temperatures 0.8-1.2), `mark: "lollipop"` avoids the zero-baseline problem that makes bar differences invisible.
- **Never mix incompatible units on a shared axis.** Putting percentages (2-8%), dollars ($531-$1,432), and counts (4-6.8) on the same quantitative axis makes some bars invisible. Normalize to a common unit (e.g., US-to-peer ratio) or use separate charts.
- **Stacked bar labels truncate inside narrow segments.** `labels: { density: "all" }` on stacked bars will clip labels like "$8,003" to "$8" when segments are thin. Use `labels: { density: "none" }` on stacked bars, or use `"$~s"` format (shows "$8k") instead of `"$,.0f"` (shows "$8,003" which gets clipped).

- **Multi-country line charts with 5+ series get crowded endpoints.** When 5+ series terminate near similar y-values, endpoint labels stack and overlap. Mitigations: reduce to 3-4 key series + aggregate "Other", or use `labels: { density: "none" }` with a legend and selective annotations.
- **Color-to-country mapping is fragile with theme arrays.** `theme: { colors: [...] }` assigns colors by series order in the data. If sort order changes, colors swap. Lock colors explicitly: `color: { field: "country", type: "nominal", scale: { domain: ["US", "Japan", ...], range: ["#c44e52", "#94a3b8", ...] } }`.
- **Annotation text near chart edges gets clipped.** Place annotations with enough `dx`/`dy` offset to keep text within the chart area. Right-edge annotations are especially prone to clipping.
- **`.0f%` format on pre-computed percentages renders 710% not 7.1%.** D3's `%` format multiplies by 100. If your data is already in percent form (e.g., 7.1 meaning 7.1%), use `".1f"` with "%" in the axis title, not `".0f%"` in the format string.
- **Data unit consistency across a chart.** If one country's migration data is in millions (1) and others are in thousands (334, 268), the labels will be misleading. Normalize all values to the same unit before embedding in the spec.
- **Verify the closing synthesis chart is genuinely different from earlier charts.** If it uses the same chart type, same categories, and same encoding as an earlier chart with just fewer rows, it's a duplicate, not a synthesis. A good synthesis uses a different framing: ratio chart instead of absolute, diverging gap instead of side-by-side, indexed comparison instead of raw values.

## MDX syntax safety (do not introduce parse errors)

These are JS/MDX syntax failures that have crashed the dev server during chart edits. Prevent them BEFORE saving:

- **Annotation objects only accept documented fields.** The openchart `TextAnnotation` schema has `type`, `x`, `y`, `text`, `dx`, `dy`, `fontSize`, `fontWeight`, `fill`, `textAnchor`. There is NO `offset` field. Do not nest `offset: { dx, dy }` inside an annotation — use top-level `dx`/`dy` instead.
- **Every property in an object literal needs a trailing comma before the next key.** When editing annotation objects, verify the last line before a new key ends in `,`. Missing commas are the #1 source of MDX build failures on this project. Example of the bug: `fill: "#c44e52"\n  offset: { dx: -70 }` — the missing comma after `"#c44e52"` is a JS syntax error.
- **Write MDX comments as a single line when possible.** Use `{/* API: POST /v1/... — Verified: YYYY-MM-DD */}` on one line. For multi-line comments, keep the body as plain prose with no Markdown-style bullet lists (`- item`), leading dashes, or asterisks. Prettier can (and does) re-escape `*` inside comment bodies that look like Markdown, turning `{/* ... */}` into `{/_ ... _/}` across the whole file and breaking every comment.
- **After any edit to annotations or comments, reload the page in playwright-cli and screenshot before declaring done.** A silent parse error shows as a Vite error overlay covering the chart; only a visual check catches it. Do not rely on "the file saved" as evidence the edit is correct.
- **If Prettier has mangled comment markers to `{/_ ... _/}`, restore with:** `perl -i -pe 's/\{\/_/\{\/*/g; s/_\/\}/*\/\}/g' src/reports/<file>.mdx`. Then restructure the comment body (remove bullets/asterisks) so Prettier leaves it alone on the next save.

## Cross-repo openchart development

When making changes to the openchart library at `~/Projects/openchart` for this project:

- **Link ALL four packages:** `core`, `engine`, `vanilla`, `react`. Missing any one (especially vanilla, which does SVG rendering) means changes won't appear in the browser.
  ```bash
  cd ~/Projects/openchart/packages/core && bun link
  cd ~/Projects/openchart/packages/engine && bun link
  cd ~/Projects/openchart/packages/vanilla && bun link
  cd ~/Projects/openchart/packages/react && bun link
  cd ~/Projects/reports && bun link @opendata-ai/openchart-core @opendata-ai/openchart-engine @opendata-ai/openchart-vanilla @opendata-ai/openchart-react
  ```
- **Always clear Vite cache after rebuilding linked packages:** `rm -rf node_modules/.vite` then restart the dev server.
- **Confirm the user's port/URL before debugging visual issues.** Don't assume port 5173.
- **When a visual change doesn't produce the expected result, inspect the rendered SVG/DOM first.** Don't iterate on input parameters (opacity, colors, theme) without checking the actual output (`fill-opacity`, gradient `stop-color`, element IDs). Silent SVG failures (broken `url()` references, invisible gradients) produce no errors.

## Debugging visual rendering issues

When a chart renders incorrectly (wrong colors, invisible elements, missing gradients):

1. **Inspect the DOM first.** Use Playwright eval or browser DevTools to check actual attribute values (`fill`, `fill-opacity`, `stop-color`).
2. **Check SVG element IDs for special characters.** Spaces, `$`, `&`, `#` in SVG `url(#id)` references break silently.
3. **Check dark mode color values.** `adaptTheme()` can make bright colors very dark. Inspect the actual hex values being rendered.
4. **Don't iterate on input parameters without verifying the output changed.** If adjusting opacity from 0.35 to 0.55 doesn't visibly change anything, the problem isn't opacity.
