---
name: data-science
description: "Staff-level data science methodology for analysis, experimentation, and modeling. Use when exploring datasets, running statistical tests, designing experiments, building ML models, evaluating results, writing SQL queries for analysis, doing feature engineering, assessing data quality, or communicating findings. Also use when the user mentions A/B testing, hypothesis testing, causal inference, model calibration, cross-validation, data pipelines, or asks about statistical significance. Activate for any analytical work involving data — even if the user doesn't explicitly say 'data science.'"
---

# Data Science

This skill encodes the methodology and judgment calls that distinguish staff-level data science from routine analysis. It covers the non-obvious pitfalls, the decisions that don't have obvious right answers, and the practices that prevent expensive mistakes.

The goal: produce analysis that holds up under scrutiny, drives real decisions, and doesn't quietly mislead.

## Before You Start Any Analysis

### Frame the Decision First

Every analysis exists to inform a decision. Before touching data, answer:

1. **What decision will this inform?** If there's no decision, there's no analysis — it's just a report.
2. **What would change your mind?** Define the threshold or evidence that would shift the recommendation. This prevents post-hoc rationalization.
3. **Who's the audience?** A VP needs "what should we do and why." A peer data scientist needs methodology details. Write for your audience, keep the other stuff available on request.

This isn't busywork. It prevents the #1 failure mode in data science: producing technically correct analysis that nobody acts on because it didn't address the actual question.

### Assess Data Quality Before Modeling

Don't trust data until you've checked it. Run these before any analysis:

- **Completeness**: What fraction of expected records exist? Are there suspicious gaps (missing weekends, holidays, specific regions)?
- **Volume sanity**: Does row count match expectations? A 10x spike or drop usually means a pipeline problem, not a real change.
- **Distribution shifts**: Compare recent data distributions to historical baselines. New categories appearing, value ranges expanding, or null rates changing all signal upstream issues.
- **Duplicates**: Check for exact and near-duplicates. Deduplication logic varies by domain — same user-timestamp pairs might be legitimate in event streams but bugs in transaction tables.
- **Join fanout**: When joining tables, check if the join produces more rows than expected. A many-to-many join silently inflates your dataset and corrupts aggregations.

When you find data quality issues, document them and their impact on the analysis. Don't silently clean and move on — the cleaning choices ARE the analysis in many cases.

---

## Statistical Analysis

### Hypothesis Testing: The Non-Obvious Parts

**Pre-register your primary metric.** Decide what you're testing before looking at results. When you test multiple metrics, you will find "significant" results by chance — even with massively underpowered studies, testing 20 metrics yields at least one p < 0.05 about 71% of the time.

**Never run post-hoc power analysis.** This comes up constantly — stakeholders ask "was our test powered enough?" after seeing results. The answer is always no (because if the result was significant, they wouldn't be asking). Post-hoc power is a direct mathematical function of the p-value and adds zero information. Instead, report confidence interval width: "Our estimate is X ± Y, which means we can't distinguish effects smaller than Z."

**Effect sizes need context, not benchmarks.** Cohen's d = 0.2 is not universally "small." A 0.2 standard deviation improvement in customer lifetime value could be worth millions. Define your Minimum Detectable Effect (MDE) based on what's actually meaningful for the business decision, not arbitrary academic thresholds.

**When choosing Bayesian vs. Frequentist:**
- **Bayesian** when: small sample sizes, you need to peek at results continuously, you have credible prior information, or you need probability statements about parameters ("85% chance the effect is positive")
- **Frequentist** when: stakeholders are more familiar with p-values, you have no defensible prior, or regulatory/compliance contexts expect traditional confidence intervals
- The practical difference matters less than doing either one correctly

### Multiple Comparisons

If you're testing more than one hypothesis, you need a correction strategy. The common ones, in order of conservatism:

1. **Bonferroni**: Divide alpha by number of tests. Simple, but overly conservative when tests are correlated.
2. **Holm-Bonferroni**: Step-down procedure. Strictly more powerful than Bonferroni with no additional assumptions.
3. **Benjamini-Hochberg (FDR)**: Controls false discovery rate instead of family-wise error rate. Better when you're exploring many hypotheses and can tolerate some false positives.

For exploratory analysis with many comparisons, FDR control is usually the right call. For confirmatory analysis where each individual claim matters, use Holm-Bonferroni.

### Simpson's Paradox and Confounders

A trend that appears in aggregated data can reverse when you break it down by subgroups. This isn't rare — it's common in any observational analysis where subgroups have different sizes and different baseline rates.

Before reporting an aggregate effect, always check if it holds within relevant subgroups (segments, cohorts, geographies). If the effect reverses, the aggregate number is misleading and you need to report at the subgroup level.

---

## Experiment Design (A/B Testing)

### Variance Reduction with CUPED

CUPED (Controlled-experiment Using Pre-Experiment Data) should be your default for any A/B test where pre-experiment data exists. It reduces variance by regressing out the predictable component of each user's metric using their pre-experiment behavior.

Non-obvious gotchas from production implementations:

- **Unequal variant splits break the standard estimator.** In 90/10 splits (common for risky changes), the pooled theta estimator can actually increase variance compared to the naive estimator. Use a weighted average estimator instead.
- **Standardize your lookback window.** 42 days captures at least one billing cycle for subscription products. For most metrics, 1-2 weeks is optimal — longer windows add noise without signal.
- **Stakeholder education is required.** CUPED-adjusted estimates move closer to zero than raw numbers. This is correct behavior (it's reducing Type M errors — effect size exaggeration), but stakeholders who saw the raw numbers first will think you're "hiding" the effect. Explain this proactively.
- **Not all metrics benefit equally.** About 40% of metrics see >20% variance reduction, but ~12% have insufficient pre-experiment data for CUPED to help.

### Network Effects and Interference

Standard A/B tests assume one user's treatment doesn't affect another user's outcome (SUTVA). This assumption is violated in:
- **Marketplaces**: Showing one buyer a discount affects what other buyers see in inventory
- **Social products**: One user's behavior change affects their connections
- **Supply-constrained systems**: Ride-sharing, delivery, ad auctions

When SUTVA is violated, your A/B test estimate is biased. Approaches:
- **Cluster randomization**: Randomize at a higher level (city, social cluster) to contain spillover
- **Switchback experiments**: Alternate the entire system between treatment/control over time periods. Watch for carryover effects — outcomes may depend on the previous period's assignment
- **Ego-cluster randomization**: Randomize based on network neighborhoods (LinkedIn's approach for feed experiments)

### Sequential Testing and Peeking

Looking at A/B test results before the planned end date inflates your false positive rate. If you check daily, you'll see a "significant" result ~30% of the time even when there's no real effect.

Solutions:
- **Sequential testing (anytime-valid inference)**: Uses confidence sequences instead of confidence intervals. Results are valid at any peek. This is production-standard at Netflix and should be your default for any test that stakeholders will want to monitor.
- **Alpha spending functions**: Pre-allocate your significance budget across planned interim analyses (O'Brien-Fleming, Pocock boundaries).

### Minimum Detectable Effect Planning

Before running a test, calculate the sample size needed to detect your MDE with adequate power (typically 80%). This determines how long the test needs to run. If the required duration is unreasonable, you have three options:
1. Accept a larger MDE (detect only bigger effects)
2. Use variance reduction (CUPED) to need fewer samples
3. Don't run the test — use a different evaluation method

Never extend a test that hasn't reached significance hoping it'll "get there." Either the effect is too small to detect with your sample, or it doesn't exist. Both are valid findings.

---

## Feature Engineering and Modeling

### Target Leakage Detection

Target leakage is the most expensive modeling mistake because it produces models that look great in evaluation and fail completely in production.

**Three forms practitioners miss:**
1. **Statistical value leakage**: Computing normalization statistics (mean, std) on the full dataset before splitting. Always fit scalers on training data only.
2. **Temporal leakage**: Rolling averages, cumulative sums, or time-window features that accidentally include future values. For any time-dependent feature, verify it uses only data available at prediction time.
3. **Context leakage**: Features with high predictive power but no causal mechanism. Example: "viewed pricing page" strongly predicts "purchased," but it's a consequence of intent, not a driver. These features don't help in production because the prediction needs to happen before the leaky event occurs.

**Partial leakage detection**: Standard correlation analysis misses leakage that only affects a subset of samples. Create histograms segmenting by feature values with target success ratio overlays — sudden drops in specific segments reveal hidden leakage.

### Time Series Cross-Validation

Standard k-fold CV leaks future information in time series data. Use **Purged Cross-Validation with Embargo**:

- **Purging**: Remove observations in the training set that overlap temporally with test observations. If your features use 30-day lookback windows, purge 30 days before each test fold.
- **Embargo**: After each test fold boundary, exclude a buffer (typically 2-5% of dataset duration) to prevent information from "leaking" through autocorrelation and reaction lags.
- **Walk-forward validation**: Sequentially expanding training windows with fixed test windows. More conservative than purged k-fold but provides fewer test folds.

The rule: if your data has a time dimension, never shuffle it for validation.

### Model Calibration

For any model whose outputs drive quantitative decisions (pricing, risk scoring, probability estimates), calibration matters more than discrimination.

- **Platt Scaling**: Fits a sigmoid to raw scores. Works well for SVMs and neural networks. Better for small calibration sets (<1000 samples).
- **Isotonic Regression**: Non-parametric, corrects any monotonic distortion. Outperforms Platt with >1000 calibration samples.
- **Recalibrate regularly.** Calibration degrades with distribution shift faster than discrimination does. A model can maintain good AUC while becoming badly miscalibrated.

Always evaluate calibration on held-out data — calibrating and evaluating on the same set will look perfect and mean nothing.

### Fairness Considerations

The impossibility theorem (Kleinberg et al., 2016): **equalized odds, demographic parity, and calibration cannot all be satisfied simultaneously** when base rates differ across groups. This isn't a technical limitation to overcome — it's a mathematical fact.

What this means in practice: you must choose which fairness definition matters for your specific context, explicitly document the tradeoff, and get stakeholder alignment. Don't pretend you can satisfy all fairness criteria at once.

---

## Data Pipelines for Analysis

### Idempotency Is Non-Negotiable

Every analytical pipeline should produce identical output when run multiple times with the same inputs. Common violations:

- Using `NOW()` or `CURRENT_DATE` in queries — pass dates as parameters instead
- Appending to tables without clearing previous results — use partition-level atomic overwrites
- Non-deterministic ordering affecting downstream aggregations

### Backfill Pitfalls

When reprocessing historical data:

1. **Never backfill from production databases.** A 6-month backfill can generate 900M queries against your OLTP system. Use immutable archives: object storage snapshots, CDC streams, or read replicas.
2. **Schema evolution breaks naive reprocessing.** If `user_id` changed from integer to UUID six months ago, your pipeline needs version-aware parsing logic.
3. **Don't overwrite active partitions.** If you're backfilling while streaming is active, only touch closed partitions (older than your max event lateness window, typically 24-48 hours).
4. **Watch for side effects.** If your pipeline sends emails, triggers webhooks, or creates charges, reprocessing will duplicate those actions. Separate computation from execution — use reconciliation patterns that compare desired state vs. actual state.

### Local-First Analysis with DuckDB

For datasets under ~200GB, DuckDB eliminates the need for distributed systems:

- **No ingestion step**: Query Parquet, CSV, and JSON files directly — including from cloud storage via the httpfs extension
- **Memory efficient**: ~300MB peak memory for a 9GB CSV (67M rows), compared to ~14.5GB for Pandas
- **SQL-native**: Write SQL against in-memory DataFrames (Pandas, Polars, Arrow) without copying data

The practical workflow: use DuckDB for exploration and aggregation via SQL, Polars for compute-heavy transformations, and Pandas when ecosystem compatibility matters (plotting libraries, specific ML tools).

---

## Communicating Results

### Structure for Decision-Makers

Lead with the recommendation, then the evidence, then the methodology. Not the other way around.

```
1. Recommendation: What should we do?
2. Key finding: What did the data show?
3. Confidence: How sure are we? (CI, caveats, risks)
4. Methodology: How did we get here? (available on request)
```

### "De-Tech" Your Presentation

Before presenting to non-technical stakeholders, identify the most technical concept and figure out how to explain it in plain language. The model details should be available if asked, not front-and-center. A VP doesn't need to know you used XGBoost — they need to know the model identifies 85% of churning customers two weeks before they leave.

### Communicate Incrementally

Don't save everything for a final reveal. Share preliminary findings, directional results, and methodology choices throughout the project. This:
- Surfaces misalignment early (are you even answering the right question?)
- Builds stakeholder buy-in gradually
- Reduces pressure on the final presentation
- Prevents the "oh, we actually needed something different" moment at the end

### Be Honest About Uncertainty

Report confidence intervals, not just point estimates. "Revenue increased 5%" sounds precise but could mean anything from -2% to +12%. "Revenue increased 5% (95% CI: 2% to 8%)" is useful because it tells the decision-maker the range of plausible outcomes.

When assumptions are shaky, say so. Transparency about limitations builds more trust than false precision.

---

## Writing Up Results

For data journalism style writing (NYT/WSJ/Economist tone), load the `data-journalist` skill. It covers narrative structure, number formatting, chart-text integration, and the specific craft of making data findings readable.

## Reference Materials

For deeper dives on specific topics, read the reference files in this skill's `references/` directory:

- `references/experimentation.md` — Detailed CUPED implementation, sequential testing, interference detection patterns
- `references/validation-checklist.md` — Step-by-step data quality and model validation checklists
