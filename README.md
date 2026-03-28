# OpenData Research

A report generator for data-driven research. Query the [OpenData API](https://tryopendata.ai), analyze datasets, and produce visual reports with charts, tables, and narrative prose. Built on Vite + React + MDX with [OpenChart](https://github.com/tryopendata/openchart) for visualizations.

Each report is a single `.mdx` file. Drop one in `src/reports/` and it shows up on the site. No config, no registry.

The real power move: point [Claude Code](https://docs.anthropic.com/en/docs/claude-code) at a research question and let it discover datasets, query them, and generate a full report with charts and analysis. The `.claude/` directory ships with everything Claude needs to do this well.

## Quick start

### Prerequisites

- [Bun](https://bun.sh) (runtime and package manager)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (only needed for AI-generated reports)
- An [OpenData API key](https://tryopendata.ai) (free, only needed for generating new reports)

### Setup

```bash
git clone https://github.com/tryopendata/research.git
cd research
bun install
```

If you want to generate new reports with Claude Code, set your API key in the shell. This is only needed for querying the OpenData API, not for viewing existing reports:

```bash
export OPENDATA_API_KEY=your_key_here
```

Start the dev server:

```bash
bun run dev
```

Open [http://localhost:5173](http://localhost:5173). You'll see the report index (empty until you create your first report).

## Generating a report with Claude Code

This is the intended workflow. Claude discovers datasets, queries data, builds charts, and writes the narrative.

### 1. Install the required plugins

Claude Code needs two plugins that aren't bundled with this repo. Install them by running these commands in Claude Code (type `/` to access slash commands):

```
/install-plugin openchart
/install-plugin opendata-api
```

| Plugin | What it does |
|--------|-------------|
| `openchart` | Chart, table, and graph spec authoring |
| `opendata-api` | OpenData REST API querying and discovery |

After installation, verify they appear in `.claude/settings.json` under `enabledPlugins`. The repo also ships local skills in `.claude/skills/` (data journalism writing, data science methodology, browser automation) that load automatically.

### 2. Ask Claude to write a report

Open Claude Code in the project root and give it a research question:

> "Write a report about how the leading causes of death in America have shifted since 1999. Which causes are rising, which are falling, and which states are hit hardest?"

Claude will:
1. Discover relevant datasets on the OpenData platform
2. Inspect schemas and query the data
3. Write an MDX report with embedded charts to `src/reports/`
4. Preview it in the browser for QA

The dev server hot-reloads on save. If Claude creates a new `.mdx` file, it'll restart the server automatically (Vite's glob import needs a restart to pick up new files).

### Example prompts

- "Compare US economic health over time: GDP growth, unemployment, and inflation."
- "Build a climate change report card. CO2 emissions, temperature records, and renewable energy adoption."
- "What correlates with national happiness? Compare happiness scores against GDP, life expectancy, and education across countries."
- "Which college degrees are actually worth the money? Compare median salaries and unemployment rates across majors against tuition costs."

## Writing a report manually

You don't need Claude. Create `src/reports/your-slug.mdx` and it becomes available at `/your-slug`.

### Required structure

```mdx
export const meta = {
  title: "Your Report Title",
  date: "2026-03-20",
  description: "One-sentence summary of the key finding.",
  tags: ["economics", "health"],
}

import { Chart } from '../components/Chart'
import { Figure } from '../components/Figure'

Your report content goes here. Write in MDX (markdown + JSX).

<Figure alt="Description of chart for accessibility">
  <Chart spec={{
    type: "line",
    data: [{ date: "2020", value: 100 }, { date: "2024", value: 150 }],
    encoding: {
      x: { field: "date", type: "temporal" },
      y: { field: "value", type: "quantitative" },
    },
    chrome: {
      title: "Values grew 50% in four years",
      subtitle: "2020-2024",
      source: "OpenData / your-dataset",
    },
  }} />
</Figure>
```

See `src/reports/_template.mdx` for a complete template with narrative structure guidelines, chart design principles, and working examples of line, bar, and scatter charts.

### Available components

| Component | Import from | Purpose |
|-----------|-------------|---------|
| `<Chart spec={...} />` | `../components/Chart` | Line, bar, scatter, area, donut charts (local wrapper with edit mode) |
| `<DataTable spec={...} />` | `@opendata-ai/openchart-react` | Sortable, searchable data tables |
| `<Graph spec={...} />` | `@opendata-ai/openchart-react` | Force-directed network graphs |
| `<Figure alt="...">` | `../components/Figure` | Wrapper with border, caption, error boundary |

Dark mode is handled automatically. No per-chart config needed.

## Data processing tools

The repo includes a zero-dependency CLI for local data processing:

```bash
# Merge two datasets on shared keys
bun run tools/data.ts merge --on country_code --join inner a.json b.json

# Compute stats for narrative prose
cat data.json | bun run tools/data.ts stats --median gdp --corr gdp,happiness

# Add computed columns
bun run tools/data.ts derive --pct-change value --over year

# Round numbers for display
bun run tools/data.ts round --precision 0
```

See [tools/README.md](tools/README.md) for the full interface.

## Project structure

```
src/
├── reports/
│   └── _template.mdx          # Report template with design guidelines
├── components/
│   ├── Figure.tsx              # Chart wrapper with error boundary
│   ├── ReportLayout.tsx        # Article layout (header, progress bar, footer)
│   ├── ReportIndex.tsx         # Landing page listing all reports
│   ├── DarkModeToggle.tsx
│   ├── ExportButton.tsx
│   └── ChartErrorBoundary.tsx
├── App.tsx                     # Routes + MDX auto-discovery
├── main.tsx                    # Entry point
└── global.css                  # Tailwind + typography
tools/
├── data.ts                     # Data processing CLI
└── README.md
.claude/
├── CLAUDE.md                   # Instructions for Claude Code
├── rules/                      # Report generation rules
├── skills/                     # Local skills (data-journalist, data-science, playwright-cli)
└── settings.json               # Plugin configuration
```

Reports are auto-discovered via Vite's `import.meta.glob`. Any `.mdx` file in `src/reports/` that doesn't start with `_` becomes a route. The filename is the URL slug.

## Tech stack

- **Runtime:** [Bun](https://bun.sh)
- **Build:** [Vite](https://vite.dev) with MDX and React plugins
- **UI:** [React 19](https://react.dev) + [React Router 7](https://reactrouter.com)
- **Styling:** [Tailwind CSS 4](https://tailwindcss.com) with typography plugin
- **Content:** [MDX 3](https://mdxjs.com) (markdown + JSX)
- **Charts:** [OpenChart](https://github.com/tryopendata/openchart) (`@opendata-ai/openchart-react`)
- **Data:** [OpenData API](https://tryopendata.ai)

## Scripts

```bash
bun run dev       # Start dev server at http://localhost:5173
bun run build     # Production build to dist/
bun run preview   # Preview production build
```

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, how to write reports, and the PR process.

## License

[MIT](LICENSE)
