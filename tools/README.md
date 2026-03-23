# tools/data.ts

Data processing CLI for report generation. Zero dependencies, runs with `bun run tools/data.ts`.

Reads JSON arrays from stdin or file arguments. Writes JSON to stdout.

## merge

Join two JSON arrays on shared keys.

```bash
# Inner join two files on country_code and year
bun run tools/data.ts merge --on country_code,year --join inner a.json b.json

# Left join: pipe one dataset, pass the other as a file
cat happiness.json | bun run tools/data.ts merge --on country_code --join left gdp.json
```

Join types: `inner` (default), `left`, `outer`.

**Notes:** Merge expects one-to-one key relationships. If the right dataset has duplicate keys, only the last row for each key is kept. When both datasets have overlapping non-key columns, the right side's values win.

## derive

Add computed columns. Operations run in order: pct-change, then rank, then ratio, then round.

```bash
# Percent change over time
cat data.json | bun run tools/data.ts derive --pct-change value --over year

# Rank by a field (1 = highest)
cat data.json | bun run tools/data.ts derive --rank gdp

# Computed ratio
cat data.json | bun run tools/data.ts derive --ratio "per_capita=gdp/population" --round 0
```

## stats

Summary statistics. Outputs a single JSON object.

```bash
cat data.json | bun run tools/data.ts stats --median value --stdev value --corr gdp,happiness --percentile "value:90"
# => { "median_value": 35.0, "stdev_value": 12.3, "corr_gdp_happiness": 0.77, "p90_value": 48.2 }
```

## round

Bulk rounding for display-ready data.

```bash
# Round all numeric fields to integers
cat data.json | bun run tools/data.ts round --precision 0

# Round specific fields to 1 decimal
cat data.json | bun run tools/data.ts round --precision 1 --fields gdp,population
```
