# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This repo generates data-driven research reports. You query datasets via the OpenData API, analyze the results, and produce visual reports with charts, tables, and narrative prose. The output is a Vite + React + MDX app where each report is a single `.mdx` file.

## Required Skills

Always load these skills at the start of every session:

**Plugins (install via Claude Code):**
- `openchart` - chart/table/graph spec authoring and rendering
- `opendata-api` - querying the OpenData REST API

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

**Before committing to a dataset**, verify:

- Column descriptions exist and indicate units (especially for price/index data)
- You understand what the values represent (dollars vs cents vs index points)
- If columns lack descriptions or use opaque codes (e.g., BLS series IDs), check for views that provide human-readable labels
- Sample a few rows to confirm the data makes sense before building analysis around it

### 4. Process and aggregate data

- Use the API's `aggregate` and `group_by` params to reduce data server-side
- For complex queries, use `POST .../query` with raw SQL (table is `data`, SELECT only, 10k row max)
- Round numbers for readability (GDP of 28708.161 becomes 28708)
- Keep inline chart data under 100 rows. Over 500 rows is an anti-pattern that bloats the MDX file

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

- **Source citations:** Use `chrome.source` in the Chart spec. Do NOT duplicate in `<Figure caption="">`. OpenChart renders source attribution inside the chart chrome, so a Figure caption repeating the same source is redundant. Only use Figure `caption` for additional context not already in the chart (e.g., methodology notes).
- **Figure default minHeight is 400px.** Pass `minHeight={0}` for DataTables or short charts: `<Figure alt="..." minHeight={0}>`.
- **Temporal x-axis padding:** D3's `.nice()` adds empty space on temporal scales. Fix: `scale: { nice: false }` on the x encoding. Apply to ALL temporal charts.

## Data Processing

The `opendata-api` skill covers SQL queries, REST aggregation, and large dataset patterns. This section covers project-specific tooling.

### Pattern 1: Single-dataset chart (most common)

Query the API with filters/aggregation and embed results directly in the chart spec. No local processing needed.

### Pattern 2: Cross-dataset analysis

Query each dataset separately and merge locally:

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
| `<Chart spec={...} />`             | `@opendata-ai/openchart-react` | Any chart type (line, bar, scatter, etc.) |
| `<DataTable spec={...} />`         | `@opendata-ai/openchart-react` | Data tables with sort/search/pagination   |
| `<Graph spec={...} />`             | `@opendata-ai/openchart-react` | Force-directed network graphs             |
| `<Figure caption="..." alt="...">` | `../components/Figure`         | Wraps charts/images with border + caption |
| `<Figure placeholder alt="...">`   | `../components/Figure`         | Placeholder for charts to be added later  |

**Standard imports for every report:**

```mdx
import { Chart } from "@opendata-ai/openchart-react";
import { Figure } from "../components/Figure";
```
