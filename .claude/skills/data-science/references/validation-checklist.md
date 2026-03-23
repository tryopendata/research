# Data Quality and Model Validation Checklists

## Pre-Analysis Data Quality Checklist

Run through these before starting any analysis. Each check should produce a concrete number or pass/fail, not a vague "looks fine."

### Completeness
- [ ] Row count matches expected volume (compare to previous periods, known population size)
- [ ] No suspicious gaps in time series (missing hours, weekends, holidays, specific regions)
- [ ] Null rates per column documented. Sudden changes in null rate indicate upstream issues, not missing data
- [ ] Expected categorical values all present (all 50 states, all product categories, all user segments)

### Consistency
- [ ] Data types match schema (no strings in numeric columns, no mixed date formats)
- [ ] Value ranges are plausible (no negative ages, no percentages > 100, no future dates in historical data)
- [ ] Referential integrity holds (every foreign key has a matching primary key)
- [ ] Aggregations are consistent (sum of parts equals total, daily sums match monthly totals)

### Duplicates
- [ ] Check for exact row duplicates
- [ ] Check for logical duplicates (same entity + timestamp with different IDs)
- [ ] Document deduplication strategy if duplicates found (keep first? keep latest? aggregate?)

### Join Integrity
- [ ] Verify join cardinality before joining (1:1, 1:many, many:many)
- [ ] Check row count before and after each join — unexpected increases mean fanout
- [ ] Check for null keys that silently drop records in inner joins
- [ ] Check for duplicate keys that create cartesian products

### Temporal Integrity (for time-dependent data)
- [ ] Events are ordered correctly (no future events before past events for same entity)
- [ ] Timestamps are in expected timezone (UTC vs. local is a common source of 8-hour shifts)
- [ ] No data from the future (clock skew, timezone bugs)
- [ ] Granularity is consistent (no mixing of daily and hourly records)

---

## Feature Engineering Validation

### Leakage Detection
- [ ] No features computed using target variable information
- [ ] Normalization/scaling fitted only on training data
- [ ] Time-dependent features use only past data (verify sliding window boundaries)
- [ ] No features that are consequences of the target rather than causes
- [ ] For each high-importance feature: can you explain WHY it predicts the target?

### Partial Leakage Check
For each feature with suspiciously high importance:
- [ ] Segment data by feature value ranges
- [ ] Plot target rate within each segment
- [ ] Look for segments with implausible target rates (0% or 100%)
- [ ] Verify the feature is available at prediction time in production

### Feature Stability
- [ ] Feature distributions are similar across train/validation/test splits
- [ ] Feature distributions are similar across time periods (no temporal drift)
- [ ] Missing value patterns are consistent across splits

---

## Model Validation Checklist

### Before Training
- [ ] Train/validation/test split respects temporal ordering (if applicable)
- [ ] No data leakage between splits (verify with the leakage detection checklist above)
- [ ] Class balance documented; resampling strategy chosen if needed
- [ ] Baseline model established (simple heuristic, majority class, naive prediction)

### Cross-Validation Strategy
- [ ] **Tabular data (no time component)**: Stratified k-fold (k=5 or 10)
- [ ] **Time series**: Walk-forward or purged CV with embargo
- [ ] **Grouped data** (multiple observations per entity): Group k-fold — same entity never in both train and test
- [ ] **Small datasets** (<1000 samples): Repeated stratified k-fold (5x5 or 10x10)

### After Training
- [ ] Performance on test set is close to validation performance (large gap = overfitting to validation)
- [ ] Performance exceeds the baseline model (if it doesn't, the model isn't useful)
- [ ] Performance is stable across cross-validation folds (high variance = unreliable)
- [ ] Model performs reasonably across subgroups (no catastrophic failure on any segment)

### Calibration (for probabilistic models)
- [ ] Reliability diagram shows predicted probabilities match observed frequencies
- [ ] Brier score or log loss reported alongside discrimination metrics
- [ ] Calibration evaluated on held-out data (not the calibration set)
- [ ] If recalibrating: Platt scaling for <1000 samples, isotonic regression for >1000

### Fairness (when model affects people)
- [ ] Define which fairness criteria matter for this context (equalized odds, demographic parity, calibration)
- [ ] Document that you cannot satisfy all three simultaneously
- [ ] Measure chosen fairness metric across protected groups
- [ ] Document the tradeoff and get stakeholder sign-off

---

## Experiment Validation Checklist

### Pre-Launch
- [ ] Primary metric defined and pre-registered
- [ ] Secondary metrics listed (with multiple comparison correction strategy)
- [ ] MDE calculated based on business relevance, not statistical convention
- [ ] Sample size calculation determines experiment duration
- [ ] Randomization unit appropriate (user, session, device, cluster)
- [ ] SUTVA assumption checked — if interference likely, use cluster or switchback design

### During Experiment
- [ ] Sample ratio mismatch (SRM) check: are group sizes as expected?
- [ ] Guardrail metrics monitored (latency, error rates, revenue)
- [ ] If peeking: using sequential testing with anytime-valid inference
- [ ] No changes to the experiment mid-flight without documenting and adjusting analysis

### Post-Experiment
- [ ] SRM check passes (chi-squared test on group sizes, p < 0.001 is concerning)
- [ ] Novelty/primacy effects assessed (was the effect stable over time, or did it decay?)
- [ ] Effect heterogeneity checked (does the effect differ across segments?)
- [ ] If using CUPED: reported both raw and adjusted estimates
- [ ] Confidence intervals reported, not just p-values
- [ ] Practical significance assessed separately from statistical significance

---

## Results Communication Checklist

### Before Presenting
- [ ] Recommendation is clearly stated in the first sentence
- [ ] Key finding is supported by a specific number with confidence interval
- [ ] Technical jargon has been "de-teched" for the audience
- [ ] Limitations and assumptions are documented (not hidden)
- [ ] "So what?" is answered — what should the audience DO with this information?

### Chart Quality
- [ ] Every chart has a title that states the finding (not just the metric name)
- [ ] Axes are labeled with units
- [ ] Y-axis starts at zero for bar/column charts (unless there's a good reason not to)
- [ ] Confidence intervals or error bars shown where applicable
- [ ] Color is meaningful (not decorative) and accessible to colorblind viewers

### Robustness
- [ ] Sensitivity analysis: does the conclusion change under different reasonable assumptions?
- [ ] Alternative specifications tested (different model, different feature set, different time window)
- [ ] If the result is surprising: have you checked for data quality issues before celebrating?
