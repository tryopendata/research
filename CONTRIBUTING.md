# Contributing

Thanks for your interest in contributing to OpenData Research. This guide covers setup, how to write reports, and the PR process.

## Prerequisites

- [Bun](https://bun.sh) (runtime and package manager)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (for AI-generated reports)
- An [OpenData API key](https://tryopendata.ai) (free, needed for querying datasets)

You can view and develop on existing reports without an API key. The key is only needed when generating new reports that query the OpenData API.

## Local setup

```bash
git clone https://github.com/tryopendata/research.git
cd research
bun install
```

Set your API key as a shell environment variable. Claude Code reads this when making API calls. It's not loaded by Vite or any dotenv file:

```bash
export OPENDATA_API_KEY=your_key_here
```

Start the dev server:

```bash
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) to see the report index.

## Claude Code setup

If you're generating reports with Claude Code, follow the plugin installation steps in the README's ["Install the required plugins"](README.md#1-install-the-required-plugins) section. The repo also ships local skills in `.claude/skills/` (data-journalist, data-science, playwright-cli) that load automatically.

## Writing a report

### With Claude Code

Open Claude Code in the project root and give it a research question:

> "Write a report about how the leading causes of death in America have shifted since 1999."

Claude discovers datasets, queries data, writes the MDX file, and previews it in the browser.

### Manually

Create `src/reports/your-slug.mdx`. The filename becomes the URL path. Every report needs a meta export:

```typescript
export const meta = {
  title: "Your Report Title",
  date: "2026-03-20",
  description: "One-sentence summary of the key finding.",
  tags: ["economics", "health"],
}
```

See `src/reports/_template.mdx` for a complete template with narrative structure, chart design principles, and working examples.

**Important:** Import `Chart` from `'../components/Chart'`, not directly from `@opendata-ai/openchart-react`. The local wrapper enables edit mode and chart persistence during development.

### Report conventions

- Reports are point-in-time snapshots. Data and assertions are accurate as of the `meta.date`. They don't auto-update.
- Chart titles should be assertions, not labels: "GDP surpassed $31T" not "GDP Over Time"
- Every section that makes a data-backed claim should have a chart proving it
- Aim for 5-7 charts per report
- Keep inline chart data under 100 rows per chart
- Use `tools/data.ts` for local data processing (merge, derive, stats, round). See [tools/README.md](tools/README.md) for the full interface

## New files need a server restart

Vite's `import.meta.glob` doesn't detect new `.mdx` files without a restart. After creating a new report file:

```bash
pkill -f vite; sleep 1; bun run dev
```

Edits to existing files hot-reload automatically.

## Code style

- TypeScript strict mode is enabled. No `any` types.
- Tailwind CSS for styling. No inline styles or CSS modules.
- Components use function declarations with explicit prop types.

## Submitting a PR

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `bun run build` to verify the production build succeeds
4. Open a PR with a clear description of what changed and why

For report contributions, include a screenshot of the rendered report in your PR description.
