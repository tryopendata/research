# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This repo generates data-driven research reports. You query datasets via the OpenData API, analyze the results, and produce visual reports with charts, tables, and narrative prose. The output is a Vite + React + MDX app where each report is a single `.mdx` file.

## Required Skills

Always load these skills at the start of every session:

**Plugins (install via Claude Code):**

- `openchart` - chart/table/graph spec authoring and rendering
- `opendata-api` - querying the OpenData REST API
- `visualize-data` - Helper for how to _design_ high quality visualizations with OpenChart

**Local skills (ship with this repo in `.claude/skills/`):**

- `data-journalist` - NYT/WSJ-style data journalism writing craft
- `data-science` - statistical rigor, experiment design, data quality methodology
- `playwright-cli` - browser automation for visual QA and screenshots

Load all references within `opendata-api` and `openchart` skills.

## End-to-End Report Workflow

When the user asks you to write a report about a topic, follow this sequence:

### 1. Start the dev server

```bash
bun run dev
```

Leave it running in the background. If it's already running, skip this step.

### 2. Discover relevant datasets

```bash
curl -s -H "Authorization: Bearer $OPENDATA_API_KEY" \
  "https://api.tryopendata.ai/v1/discover?q=<topic description>"
```

The discover endpoint returns datasets with schemas, descriptions, and relevance scores. Search by topic, not keywords (e.g., "mortality trends in America" not "cdc death data").

Each result includes: `provider` + `slug` (use these to build query URLs), `columns` (names, types, descriptions), `rows` (dataset size), `relevance` (0-1 score), `canonical_questions` (what this dataset can answer), and `methodology_summary`. Pick datasets with high relevance and column schemas that match your needs. See the `opendata-api` skill's `references/discover.md` for full response schema and advanced options.

### 3. Inspect schemas, views, and query data

For each relevant dataset:

```bash
# Check what columns exist (verify descriptions and types make sense)
curl -s -H "Authorization: Bearer $OPENDATA_API_KEY" \
  "https://api.tryopendata.ai/v1/datasets/{provider}/{dataset}/columns"

# Check for curated views (these often solve messy raw schemas)
curl -s -H "Authorization: Bearer $OPENDATA_API_KEY" \
  "https://api.tryopendata.ai/v1/datasets/{provider}/{dataset}/views"

# Query data with filters and aggregation
curl -s -H "Authorization: Bearer $OPENDATA_API_KEY" \
  "https://api.tryopendata.ai/v1/datasets/{provider}/{dataset}?filter%5Byear%5D%5Bgte%5D=2020&sort=-year&limit=100"
```

**Use SQL to explore and refine large or verbose datasets.** Many datasets have millions of rows, opaque column codes, or wide schemas where only a few columns matter. Instead of paginating through REST results, use the SQL endpoint to quickly validate data, check value distributions, and extract exactly what you need:

```bash
# Check distinct values in a column (what categories exist?)
curl -X POST "https://api.tryopendata.ai/v1/datasets/bls/cpi-u/query" \
  -H "Authorization: Bearer $OPENDATA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT DISTINCT category, COUNT(*) as n FROM data GROUP BY category ORDER BY n DESC LIMIT 20"}'

# Check date range and coverage
curl -X POST "https://api.tryopendata.ai/v1/datasets/cdc/leading-causes-of-death/query" \
  -H "Authorization: Bearer $OPENDATA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT MIN(year) as earliest, MAX(year) as latest, COUNT(DISTINCT state) as states, COUNT(DISTINCT cause_name) as causes FROM data"}'

# Sample rows matching a specific condition
curl -X POST "https://api.tryopendata.ai/v1/datasets/austin/dispatch-incidents/query" \
  -H "Authorization: Bearer $OPENDATA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM data WHERE mental_health_flag = true LIMIT 5"}'
```

**Before committing to a dataset**, verify:

- Column descriptions exist and indicate units (especially for price/index data)
- You understand what the values represent (dollars vs cents vs index points)
- If columns lack descriptions or use opaque codes (e.g., BLS series IDs), check for views that provide human-readable labels
- Use SQL to sample rows, check value distributions, and confirm the data makes sense before building analysis around it

### 4. Process and aggregate data

**Choose the right query method:**

| Use case | Method | Why |
|----------|--------|-----|
| Simple filters, sorts, single aggregations | REST params (`filter`, `aggregate`, `group_by`) | Fastest, most reliable, good for straightforward queries |
| Multiple aggregates, CASE/WHEN logic, window functions, CTEs, percent-change calculations | `POST /v1/datasets/{provider}/{dataset}/query` with SQL | One call instead of multiple REST requests. Table is `data`. |
| Joining data across 2-5 datasets server-side | `POST /v1/query` with cross-dataset SQL | Avoids fetching each dataset separately and merging locally. Use `provider.dataset` or `"provider/dataset"` as table names. |

**SQL endpoint basics:**
```bash
# Single dataset: complex aggregation
curl -X POST "https://api.tryopendata.ai/v1/datasets/fred/cpi/query" \
  -H "Authorization: Bearer $OPENDATA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT EXTRACT(YEAR FROM date) as year, AVG(value) as avg_cpi FROM data GROUP BY year ORDER BY year"}'

# Cross-dataset join: compare two datasets server-side
curl -X POST "https://api.tryopendata.ai/v1/query" \
  -H "Authorization: Bearer $OPENDATA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT g.country, g.year, g.gdp_per_capita, h.happiness_score FROM owid.gdp g JOIN owid.happiness h ON g.country_code = h.country_code AND g.year = h.year WHERE g.year = 2022"}'
```

Cross-dataset SQL supports up to 5 datasets per query, 150MB combined parquet size, 10s max timeout, 10k row limit. Use quoted slash notation for dataset names with hyphens: `"fred/unemployment-rate"`. See the `opendata-api` skill's `references/sql-query.md` for full syntax, allowed functions, and error codes.

**Prefer SQL over local merging** when the join is straightforward (shared keys like country_code + year). Use local merging (Pattern 2 below) only when you need to transform data between fetch and join, or when the SQL endpoint fails.

**General rules:**
- Round numbers for readability (GDP of 28708.161 becomes 28708)
- Keep inline chart data under 100 rows. Over 500 rows is an anti-pattern that bloats the MDX file
- If the SQL endpoint returns a 5xx, fall back to REST aggregation params for the same analysis

### 5. Write the report MDX file

Create `src/reports/<slug>.mdx`. See `src/reports/_template.mdx` for the skeleton with full design principles and chart examples.

### 6. Add the Data Sources & Methodology section

Every report ends with a `## Data sources & methodology` section after the narrative closing. This provides traceability for the numbers and conclusions in the report. Include:

- **Datasets used** — List each dataset by `provider/slug` with what was pulled and the time range
- **Calculations & transformations** — Derived metrics (inflation adjustments, per-capita, percent change, correlations), aggregation methods, any data merging across datasets
- **Limitations** — Data gaps, suppressed values, methodology changes over time, caveats
- **Access date** — When the data was queried

Keep it concise. Bulleted list or a few short paragraphs. The goal is that someone questioning a specific number can trace it back to the source dataset and understand how it was processed.

See `src/reports/_template.mdx` for the skeleton.

### 7. Preview and QA

```bash
playwright-cli open http://localhost:5173/<slug>
playwright-cli screenshot
```

Check: charts render, data looks right, prose reads well, no layout issues.

## Writing Style

Reports should read like data journalism from the New York Times or The Economist:

- **Lead with the finding, not the methodology.** "One in four Illinois students is chronically absent" not "We analyzed ISBE data to examine attendance patterns."
- **Use specific numbers.** "GDP hit $31.1 trillion" not "GDP increased significantly."
- **Headlines tell the story.** Chart titles are assertions: "US GDP surpassed $31 trillion in mid-2025" not "US GDP Over Time."
- **Connect the data to reality.** "A percentage point doesn't sound like much, but in a labor force of 168 million people, it represents 1.7 million additional people looking for work."
- **No jargon without context.** If you use CPI, explain it means the cost of a basket of goods.
- **Structure as narrative, not report.** Sections flow into each other. Each chart supports a point in the story.

## OpenData API

The `opendata-api` skill covers API usage, filter syntax, aggregation, SQL queries, and common pitfalls. Always use production: `https://api.tryopendata.ai`.

## OpenChart Specs

Chart specs follow the `openchart` skill's guidance. Load `color-strategy.md`, `editorial-writing.md`, and `design-review.md` references for chart types, color strategy, annotations, and design standards.

**Project-specific notes:**

- **Use the local Chart wrapper.** Import `Chart` from `'../components/Chart'`, NOT from `'@opendata-ai/openchart-react'`. The local wrapper (`src/components/Chart.tsx`) adds `onEdit` by default so all charts render in edit mode (draggable annotations, legend, chrome). Edits are logged to the console.
- **Source citations:** Use `chrome.source` in the Chart spec. Do NOT duplicate in `<Figure caption="">`. OpenChart renders source attribution inside the chart chrome, so a Figure caption repeating the same source is redundant. Only use Figure `caption` for additional context not already in the chart (e.g., methodology notes).
- **Figure default minHeight is 400px.** Pass `minHeight={0}` for DataTables or short charts: `<Figure alt="..." minHeight={0}>`.
- **Always set `scale: { nice: false }` on all axes by default.** D3's `.nice()` rounds scale domains outward to "clean" tick values, which creates empty padding (e.g., data ending at $130k gets an axis extending to $1M on log scales, or a temporal axis adding years of dead space). Set `nice: false` on every encoding's scale unless you have a specific reason to want rounded domain boundaries. This applies to temporal, quantitative, and log scales alike.
- **Use multi-field tooltip arrays on scatter plots.** `tooltip: [{ field: "country", type: "nominal" }, { field: "gdp", type: "quantitative" }]` shows both entity name and values on hover. Always include the identifying field first.
- **Use `mark: "lollipop"` for narrow-range categorical data.** When values don't include zero (happiness 6.0-7.8, temp anomalies 0.8-1.2), lollipop marks avoid the zero-baseline problem that makes bar differences invisible. Accepts nominal/ordinal on y, quantitative on x.
- **Lock color-to-series mapping explicitly.** Don't rely on `theme.colors` array ordering (fragile). Use `color: { field: "country", type: "nominal", scale: { domain: [...], range: [...] } }` to guarantee colors survive data reordering.

## Data Processing

The `opendata-api` skill covers SQL queries, REST aggregation, and large dataset patterns. This section covers project-specific tooling.

### Pattern 1: Single-dataset chart (most common)

Query the API with filters/aggregation and embed results directly in the chart spec. No local processing needed.

### Pattern 2: Cross-dataset analysis

**Preferred: use the cross-dataset SQL endpoint** to join server-side (see step 4 above for syntax). This avoids fetching each dataset separately.

**Fallback: fetch and merge locally** when you need to transform data between fetch and join, or when the SQL endpoint fails:

```bash
curl -s -H "Authorization: Bearer $OPENDATA_API_KEY" \
  "https://api.tryopendata.ai/v1/datasets/owid/happiness?filter%5Byear%5D=2022&fields=country_code,happiness_score" > /tmp/happiness.json
curl -s -H "Authorization: Bearer $OPENDATA_API_KEY" \
  "https://api.tryopendata.ai/v1/datasets/owid/gdp?filter%5Byear%5D=2022&fields=country_code,gdp_per_capita" > /tmp/gdp.json
bun run tools/data.ts merge --on country_code --join inner /tmp/happiness.json /tmp/gdp.json
```

### Pattern 3: Quick stats for narrative prose

```bash
cat data.json | bun run tools/data.ts stats --median gdp --corr gdp,happiness
# => { "median_gdp": 12500, "corr_gdp_happiness": 0.77 }
```

See `tools/README.md` for the full interface.

### Anti-patterns

- Don't install pandas/numpy. It's overkill for 50-row datasets.
- Don't embed >100 rows per chart in MDX. Over 500 rows is a bloat problem.
- Don't do locally what the SQL endpoint can do server-side.
- For small datasets (<30 rows), just construct the data array manually. It's faster than piping through tools.

## Local Development

```bash
bun install          # Install dependencies (first time only)
bun run dev          # Start Vite dev server at http://localhost:5173
bun run build        # Production build to dist/
```

Vite HMR auto-reloads when you save changes to existing files. **New `.mdx` files require a dev server restart** to be discovered by `import.meta.glob`. After creating a new report file, restart the server:

```bash
pkill -f vite; sleep 1; bun run dev
```

## Report File Format

**One file per report:** `src/reports/<slug>.mdx`. The filename becomes the URL slug. No registry, no config file, no second file to edit.

**Required meta export:**

```typescript
export const meta = {
  title: "Report Title",
  date: "2026-03-20",
  description: "One-sentence summary.",
  tags: ["tag1", "tag2"],
};
```

## Available Components

Import directly in MDX. Dark mode is handled automatically. No per-chart config needed.

| Component                          | Import                         | Purpose                                   |
| ---------------------------------- | ------------------------------ | ----------------------------------------- |
| `<Chart spec={...} />`             | `../components/Chart`          | Any chart type (line, bar, scatter, etc.) with edit mode enabled |
| `<DataTable spec={...} />`         | `@opendata-ai/openchart-react` | Data tables with sort/search/pagination   |
| `<Graph spec={...} />`             | `@opendata-ai/openchart-react` | Force-directed network graphs             |
| `<Figure caption="..." alt="...">` | `../components/Figure`         | Wraps charts/images with border + caption |
| `<Figure placeholder alt="...">`   | `../components/Figure`         | Placeholder for charts to be added later  |

**Standard imports for every report:**

```mdx
import { Chart } from "../components/Chart";
import { Figure } from "../components/Figure";
```
