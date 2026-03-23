---
paths:
  - "*"
---

Make sure these skills are loaded: openchart, opendata-api, data-journalist, data-science. Load all references within openchart and opendata-api.

## When generating a report

1. Start the dev server if not already running: `bun run dev`
2. **Dispatch research agents in parallel** using appropriate model tiers:
   - **haiku** for simple data fetches with known endpoints/filters
   - **sonnet** for dataset discovery, schema comparison, and multi-step research
   - Keep **opus** for the main orchestration thread (narrative writing, chart design, editorial decisions)
3. Write the report to `src/reports/<slug>.mdx`
4. Preview with playwright-cli: `playwright-cli open http://localhost:5173/<slug>` then `playwright-cli screenshot`
5. Verify: charts render correctly, prose reads well, no layout issues

## Report conventions

- Reports live in `src/reports/<slug>.mdx`
- Files starting with `_` are ignored (e.g., `_template.mdx`)
- The slug in the filename becomes the URL path
- Every report needs `export const meta = { title, date, description, tags }`
- See `src/reports/_template.mdx` for the skeleton with design principles and chart examples
- Chart titles should be assertions, not labels ("GDP surpassed $31T" not "GDP Over Time")
- Each Figure needs an `alt` describing the chart
- Put data source attribution in `chrome.source` inside the Chart spec, not in `<Figure caption="">`. Only use Figure caption for context not already in the chart (e.g., methodology notes)
- Aim for 3-5 charts per report. More than 6 usually means you're not editing enough.

## Visualization design (non-negotiable)

Follow the `openchart` skill's design philosophy references for every chart. Load `color-strategy.md`, `editorial-writing.md`, and `design-review.md` when writing chart specs.

- **Color checkpoint before every chart.** Uniform/mono-color charts are never acceptable when the data has narrative variation.
- **Annotate the story.** Mark inflection points, anomalies, crossovers, and notable periods. Reference lines at meaningful thresholds. Label outliers directly. Budget: 0-3 per chart.
- **Endpoint labels on line charts.** Use `labels: { density: "endpoints" }`.
- **Run the 5-second test.** Cover the title, look at the chart. Can you state the takeaway?
