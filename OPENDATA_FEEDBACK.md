# OpenData API Platform Feedback

Post-mortem from the `texas-schools-crisis` report session (2026-04-09/10).

## Actual Bugs (Non-2xx / Incorrect Behavior)

### 2. Trailing whitespace in state names (`nces/teacher-salary-by-state`)

State values have trailing spaces (e.g., `"Texas "`, `"California "`) and the national aggregate has leading spaces (`"   United States "`). This caused `WHERE state IN ('Texas', 'United States')` to return 0 rows. Had to use `TRIM(state)` in every query. The dataset also contains non-data rows mixed in (footnotes, source attributions stored as state values):

```
"NOTE: Some data have been revised from previously published figures..."
"SOURCE: National Education Association, Estimates of School Statistics..."
"\\1\\Constant dollars based on the Consumer Price Index..."
```

These should be cleaned during ingestion, not left for consumers to filter out.

### 3. `nces/sat-scores` uses `"United States"` while other NCES datasets use `"National"`

Inconsistent naming for the national aggregate across datasets. `nces/naep` uses `jurisdiction_name` with values like `"National public"`. `nces/sat-scores` uses `state = "United States"`. `nces/teacher-salary-by-state` also uses `"United States"` (with whitespace). There's no way to know which convention a dataset uses without querying `SELECT DISTINCT`.

Mega Note on this one: this is a fundamental issue in open source data: people name shit different. We cant be expected to normalize this on ingestion, but if there is a provider that uses multiple different names for the same thing (National, United States, etc) then maybe this can be solved with a view? But to be honest, this doenst sound like a problem that we're responsible for solving, certainly not on ingestion: that would be unscalable wack-a-mole.

---

## DX Issues (Unintuitive, Hard to Use)

### 4. Column names differ between enriched/REST and raw SQL

This was a major time sink in the earlier part of this session. The REST endpoint returns enriched column names (e.g., `function_name`, `object_category`, `fund_category`) but SQL queries against `data` use the raw column names. Querying `WHERE function_name = 'Instruction'` in SQL fails because the column is actually a code like `function_code`. The error message says "column not found" but doesn't suggest the raw equivalent.

**Suggestion:** Either
(a) make enriched column names work in SQL via aliases (preferred if possible) or
(b) include both raw and enriched names in the `/columns` endpoint response so users can see the mapping (less ideal DX solution).

### 5. Wide-format datasets are painful to query

`nces/teacher-salary-by-state` stores data as one row per state with columns like `salary_constant_1969_70`, `salary_constant_1979_80`, etc. To get a time series, you have to manually SELECT each column and UNION or pivot them. This is a common pattern in NCES digest tables. We should convert wide format to long (we already do this for many other datasets, so these must have been missed)

**Suggestion:** Fix these wide formats to be converted to long. Look up the `wide_to_long` transform

### 6. No historical SAT data pre-2017

The `nces/sat-scores` dataset only covers 2017-2023 (6 years, missing 2019). The College Board has published state-level SAT data going back to the 1970s in various NCES digest tables (Table 226.40 and predecessors). This is a significant gap for any education analysis that wants to show long-term trends. We had to cut an entire section from the report because the data window was too short to make credible claims.

How can we get this data back all the way to ~1970?

### 7. Discover endpoint returns relevance scores but no year range

When evaluating whether a dataset is useful, the most important question after "does it have the right columns?" is "does it cover the time period I need?" The discover response includes column schemas and row counts but not the min/max of temporal columns. Had to query each dataset separately to check coverage.

**Suggestion:** Include `temporal_range: { min: "1994", max: "2024" }` in discover results for datasets with temporal columns.

### 8. No way to know a dataset is wide-format before querying

Some datasets are one-row-per-entity with year-columns (wide), others are long-format with a year column. The discover and columns endpoints don't distinguish these. You figure it out by sampling rows and seeing columns named `salary_constant_1969_70`.

Note: this can be solved by not having wide format datasets. These should all use `wide_to_long` transform during ingestion

### 9. `filter[col]=val` vs `?col=val` silent failure

Bare `?year=2024` returns all rows with a warning buried in the response. This should be a 400 error, not a 200 with unfiltered data and a warning.

---

## Data Quality Issues

### 10. NCES datasets have inconsistent identifier conventions

- `nces/naep`: `jurisdiction_name` for states
- `nces/sat-scores`: `state` for states
- `nces/teacher-salary-by-state`: `state` for states (with whitespace)
- `nces/ccd`: `fips` (numeric) for states
- `nces/district-dropout`: `st` (2-letter abbreviation) for states
- `nces/district-enrollment`: `st` (2-letter abbreviation) for states

Every time you switch NCES datasets, you have to re-discover how states are identified. A cross-dataset `state` standardization (or at least a `state_fips` join key on all NCES datasets) would make cross-dataset analysis much easier.

## Positive Notes

- The SQL endpoint (when it works) is powerful and handles complex aggregations well.
- Cross-dataset SQL joins (`POST /v1/query`) worked when I used them.
- The `/columns` endpoint with value distributions is very helpful for understanding data before querying.
- Parameterized queries (`?` placeholders with `params` array) eliminate SQL injection and quoting headaches.
- The `debug=true` parameter showing generated SQL is useful for verifying REST queries.
