# Internal Guidance Feedback (`.claude/` Improvements)

Post-mortem from the `texas-schools-crisis` report session (2026-04-09/10).

## Status: Applied (2026-04-09)

All 7 items have been applied. Changes were split between the openchart skill (`~/Projects/skills/plugins/openchart/`) and this repo's `.claude/rules/`. Where possible, existing scattered guidance was consolidated rather than adding more content.

| # | Item | Applied to | Approach |
|---|---|---|---|
| 1 | Legend vs labels decision framework | openchart `design-review.md` + refactored `global.md` | Added decision table to design-review.md. Consolidated 3 scattered bullets in global.md into 1 reference. |
| 2 | Axis title length (<25 chars) | openchart `design-review.md` row #15 | New checklist row |
| 3 | Superlative claim verification | `.claude/rules/data-integrity.md` | New subsection with relative threshold guidance |
| 4 | Report color palette workflow | `.claude/rules/global.md` | Workflow instruction (no hardcoded hex), references color-strategy.md |
| 5 | Y-axis % suffix | openchart `design-review.md` row #11 | Strengthened existing row (already covered in 3 other places) |
| 6 | Layer chart gotchas | openchart `SKILL.md` Known Gotchas table | New row in existing table |
| 7 | Agent verification mandate | `.claude/rules/global.md` dispatch pattern + `data-integrity.md` rule #5 | Strengthened both locations |

## Findings

### 1. No guidance on when to use legend vs endpoint labels vs annotations

**What happened:** Nearly every chart needed the user to say "legend is redundant, remove it" or "keep legend, remove annotations." This happened 5+ times across the session. The rules mention both features but don't say when to prefer one over the other.

**Root cause:** Missing decision framework in `global.md` visualization design section.

**Proposed addition to `.claude/rules/global.md`:**
```markdown
### Legend vs. endpoint labels vs. annotations — pick ONE identification method per chart

- **2-series line/area charts:** Use endpoint labels (`labels: { density: "endpoints" }`) + hide legend (`legend: { show: false }`). Two series are easy to identify at the line endpoints.
- **3+ series line charts:** Use legend + hide endpoint labels (`labels: { density: "none" }`). Endpoint labels crowd and overlap with 3+ series.
- **Bar/column charts with color encoding:** Use legend only. Bar labels show values, not series names.
- **Single-series charts:** Hide legend (`legend: { show: false }`). Nothing to differentiate.

Never show both legend AND endpoint labels on the same chart. They're redundant and waste space.
```

**Priority:** High — this was the most repeated correction in the session.

---

### 2. No guidance on axis label length

**What happened:** Two charts had y-axis titles too long ("Students eligible for free/reduced lunch"), causing the title to wrap vertically and eat into the chart area. User flagged both.

**Root cause:** No rule about axis title length in the visualization design section.

**Proposed addition to `.claude/rules/global.md`:**
```markdown
- **Keep axis titles under 25 characters.** Long titles like "Students eligible for free/reduced lunch" wrap and consume chart space. Use abbreviations the subtitle can define: "FRPL-eligible share", "Per-pupil spending", "Avg. salary (2022 $)". If the axis title needs explanation, put it in the subtitle.
```

**Priority:** Medium — came up twice, easy to prevent.

---

### 3. No guidance on verifying superlative claims

**What happened:** The chart title said "best-in-class" for Texas NAEP scores. The user questioned it. Investigation revealed Texas was #10, not #1. The prose said "among the highest in the country" which was technically defensible but the chart title was misleading.

**Root cause:** No rule about verifying ranked claims before using superlatives.

**Proposed addition to `.claude/rules/data-integrity.md`:**
```markdown
### Verify superlative claims with rankings
Before using terms like "best," "worst," "highest," "lowest," "most," or "least" in chart titles or prose, query the full ranking. "Best-in-class" requires being #1. "Among the highest" requires being in the top 5. "Above average" is the safe choice when rank is 6+. Always include the actual rank in the annotation (e.g., "#10 nationally") so readers can judge for themselves.
```

**Priority:** High — misleading claims undermine report credibility.

---

### 4. No guidance on consistent color palettes across a report

**What happened:** The charter accountability chart used random purple/orange colors that didn't match the report's established palette. User had to flag it.

**Root cause:** The rules say "Consistent color palette across related charts" in the first-draft checklist but don't define what the standard palette IS for this project or how to choose one.

**Proposed addition to `.claude/rules/global.md`:**
```markdown
### Establish a report color palette early
After the first 2-3 charts, lock in a palette and document it in a comment at the top of the MDX file. All subsequent charts should draw from this palette. Common patterns:
- **Primary entity** (Texas, the subject): `#dc2626` (red)
- **Secondary entity / comparison** (National avg, peer): `#94a3b8` (slate gray)
- **Institutional blue** (traditional ISDs, government): `#2563eb`
- **Highlight / accent** (charter, disruption, new): `#f59e0b` (amber)
- **Positive / good**: `#22c55e` (green)
- **Muted peers**: `#94a3b8`, `#cbd5e1` (gray variants)
- **National average / baseline**: dashed line style + `#cbd5e1`
```

**Priority:** Medium — improves visual coherence.

---

### 5. Y-axis values missing units (% suffix)

**What happened:** Multiple charts showed bare numbers like "45", "60" on the y-axis when they represented percentages. User had to flag "append % to values" twice.

**Root cause:** The rules mention `".0f%"` format in the gotchas section but don't make it a default for percentage data.

**Proposed addition to `.claude/rules/global.md` under "Axis ticks show units":**
```markdown
- **Percentage data MUST show % on axis ticks.** Use `format: ".0f%"` (literal suffix) when data is already in percent form (e.g., 45 meaning 45%). Never show bare numbers for percentage data — "45" is ambiguous, "45%" is not. This applies to both axis ticks and labels.
```

**Priority:** Medium — came up twice, simple fix.

---

### 6. Layer charts need better guidance or a warning

**What happened:** Attempted to convert the recapture area chart to a `layer` chart to add an inflation baseline. The result was broken (second layer rendered at wrong scale). Had to roll back entirely.

**Root cause:** No guidance in rules about when layer charts work well vs when they're fragile. The openchart skill documents the `layer` API but doesn't cover shared-scale gotchas.

**Proposed addition to `.claude/rules/global.md`:**
```markdown
### Layer charts: use with caution
Layer composition overlays multiple marks in shared coordinate space. Known pitfalls:
- Both layers must use the same scale domains or the second layer will render at wrong positions
- Area + line layers can produce z-ordering issues (area may cover the line)
- For simple overlays (adding a reference line or baseline), prefer `annotations` with `refline` instead of a full layer
- Only use `layer` when you genuinely need two different mark types with different data (e.g., bar + line combo chart)
```

**Priority:** Low — uncommon pattern, but saves time when it comes up.

---

### 7. Data research agents getting stuck / hallucinating

**What happened:** Earlier in the session (from the summary), research agents got stuck and the user told me to query the API directly. The data-verification memory file also notes agents hallucinating FRPL rates.

**Root cause:** Already documented in memory (`feedback-data-verification.md`), but the `global.md` dispatch pattern doesn't emphasize verification strongly enough.

**Proposed addition to `.claude/rules/global.md` dispatch pattern:**
```markdown
**Verification is mandatory, not optional.** After any data-researcher agent returns numbers, run at least one independent verification query from the main thread before embedding data in a chart. Research agents can hallucinate plausible-looking values. If a researcher returns data you can't verify via API, do not use it.
```

**Priority:** High — hallucinated data in a published report is the worst-case scenario.

---

## Summary

The two highest-impact improvements:
1. **Add legend-vs-labels decision framework** — would have prevented 5+ user corrections
2. **Add superlative claim verification rule** — would have prevented a misleading chart title

The recurring theme: the rules cover *what* to do (use endpoint labels, format axes, cite sources) but often miss *when* to choose between options. Adding decision frameworks (not just feature lists) would reduce the back-and-forth significantly.
