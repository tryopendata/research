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
- **Annotate the story.** Mark inflection points, anomalies, crossovers, and notable periods. Reference lines at meaningful thresholds. Label outliers directly. Budget: 0-3 per chart.
- **Line charts get dots by default.** Use `mark: { type: "line", point: true, interpolate: "monotone" }` so each data point is visible. Only omit `point: true` for very dense time series (50+ data points per series) where dots would overlap.
- **Endpoint labels on line charts.** Use `labels: { density: "endpoints" }`.
- **Horizontal bar charts must be readable without tracing to the y-axis.** The default bar labels only show the value, forcing readers to scan left to identify what each bar represents. For bars where the y-axis label is far from the bar end (long bars, many categories), bake the category name into the data value field so the label includes both (e.g., `{ country: "United States", label: "United States 1,200", value: 1200 }`), or keep bars short enough that the y-axis label is visually adjacent. When bars are invisible (e.g., zero or near-zero values), this problem is amplified because the remaining bars lose their spatial association with axis labels.
- **Run the 5-second test.** Cover the title, look at the chart. Can you state the takeaway?
- **Format large numbers with SI suffixes.** Use `"~s"` (or `"$~s"` for currency) in `axis.format` and `labels.format` so 100,000 displays as `100k`, 1,500,000 as `1.5M`, 2,000,000,000 as `2B`, etc. Raw unformatted numbers like `1000000` are never acceptable on axes or labels. For non-round values where `~s` produces ugly decimals (e.g., 60,420 → `60.4k`), round the data first or use `"$,.0f"` / `",.0f"` with comma separators instead.
- **Diverging bar charts (positive + negative values) must NOT use `color` encoding with a categorical field.** Using `color: { field: "zone", type: "nominal" }` on a bar chart triggers stacked bar logic, which breaks negative bar rendering. Instead, use **conditional color encoding** to color bars by sign: `color: { condition: { test: { field: "value", gte: 0 }, value: "#4CAF50" }, value: "#F44336" }`. Add a refline at x=0 for the zero baseline. This renders each bar individually with the correct color based on its value.
- **Annotations must not collide with endpoint labels.** When using `labels: { density: "endpoints" }`, the engine renders series name + value at the last data point of each series. Do NOT place text annotations near those same endpoints — they will overlap. Two options: (1) Use `labels: { density: "none" }` and let the annotations carry the endpoint information instead, or (2) keep endpoint labels and place annotations at mid-series points (inflections, crossovers) rather than endpoints. Never double up both at the same data point.
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
- **Legend overflow at 3+ series.** OpenChart shows "+1 more" when the legend doesn't fit. For charts with 3+ color-encoded series, either shorten series names, use `legend: { position: "bottom" }` for more space, or rely on endpoint labels instead (`legend: { show: false }`).
- **Multi-country line charts with 5+ series get crowded endpoints.** When 5+ series terminate near similar y-values, endpoint labels stack and overlap. Mitigations: reduce to 3-4 key series + aggregate "Other", or use `labels: { density: "none" }` with a legend and selective annotations.
- **Color-to-country mapping is fragile with theme arrays.** `theme: { colors: [...] }` assigns colors by series order in the data. If sort order changes, colors swap. Lock colors explicitly: `color: { field: "country", type: "nominal", scale: { domain: ["US", "Japan", ...], range: ["#c44e52", "#94a3b8", ...] } }`.
- **Annotation text near chart edges gets clipped.** Place annotations with enough `dx`/`dy` offset to keep text within the chart area. Right-edge annotations are especially prone to clipping.
- **`.0f%` format on pre-computed percentages renders 710% not 7.1%.** D3's `%` format multiplies by 100. If your data is already in percent form (e.g., 7.1 meaning 7.1%), use `".1f"` with "%" in the axis title, not `".0f%"` in the format string.
- **Data unit consistency across a chart.** If one country's migration data is in millions (1) and others are in thousands (334, 268), the labels will be misleading. Normalize all values to the same unit before embedding in the spec.
- **Verify the closing synthesis chart is genuinely different from earlier charts.** If it uses the same chart type, same categories, and same encoding as an earlier chart with just fewer rows, it's a duplicate, not a synthesis. A good synthesis uses a different framing: ratio chart instead of absolute, diverging gap instead of side-by-side, indexed comparison instead of raw values.
