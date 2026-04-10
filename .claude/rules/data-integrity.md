---
paths:
  - "src/reports/*.mdx"
---

## Data integrity for report charts

Every number in a chart spec must be traceable to an API query. Never use recalled, estimated, or interpolated values in chart data arrays.

### Required workflow

1. **Query first, chart second.** Run the API query, capture the response, then copy numbers from the response into the chart spec. Never construct chart data from memory or general knowledge.

2. **Log the query above every chart.** Place an MDX comment directly above each `<Figure>` with the exact API call that produced the data:
   - OpenData API queries: `{/* API: POST /v1/datasets/nces/ccd/query — SQL: SELECT ... \n Verified: YYYY-MM-DD */}`
   - Non-API sources: `{/* Source: [name] — [direct URL]. Not reproducible from API. */}`
   - For non-API sources (district budget docs, news reports), include direct URLs to the specific documents used. "Austin ISD budget documents" is not sufficient; link to the actual PDF or webpage.

3. **Never mix sources silently.** If a chart uses data from a non-API source (budget documents, news reports, advocacy organizations), the `chrome.source` must name that source explicitly. Do not cite "TEA" or "PEIMS" for data that came from district budget documents or media reports.

4. **Cross-check derived values.** If you compute a percentage, ratio, or derived metric from queried data, show the math (even if only in a comment). Example: `{/* 635M / 3495M = 18.2% */}`

5. **Dispatch data-fetcher agents for verification.** When a data-researcher agent returns numbers, verify key claims with a separate data-fetcher query before embedding them in the report. The initial research agent may hallucinate plausible values. If a researcher returns data you cannot verify via API, do not use it.

6. **Flag measurement methodology differences.** When the same metric can be measured multiple ways (e.g., PEIMS cash payments vs. district-reported total obligation), explicitly state which method you're using in both the chart source and the methodology section. If switching methods between charts, call out the switch in the prose.

### Verify superlative claims with rankings

Before using "best," "worst," "highest," "lowest," "most," or "least" in chart titles or prose, query the full ranking. Superlatives imply a specific position that readers will take at face value.

| Claim language | Requires | Example |
|---|---|---|
| "The highest" / "best-in-class" | Rank #1 | Only if the entity is literally first |
| "Among the highest" | Top 10% or top quartile | Texas NAEP scores at #10/50 states qualifies |
| "Above average" | Above the median | Safe choice when rank is middling |

Always include the actual rank in an annotation or parenthetical (e.g., "#10 nationally") so readers can judge for themselves. Use relative thresholds (top quartile, above median) rather than fixed cutoffs like "top 5," since rank context varies by population size (50 states vs. 200 countries).

### Common failure modes to watch for

- **National aggregates from CCD**: Early years (pre-2002) have incomplete FRPL reporting. Flag this in methodology if using pre-2002 national FRPL data.
- **TEA PEIMS object codes**: Different object codes capture different pieces of the same transaction (3480 = fund transfer, 7915 = cash payment). They are NOT interchangeable and will produce different dollar amounts.
- **Census SAIPE vintage years**: SAIPE releases revised estimates annually. Always specify the query year, not just "2023 data."
- **District enrollment peaks**: CCD goes back to 1986. Don't call something a "peak" if you only checked from 2005 onward.
