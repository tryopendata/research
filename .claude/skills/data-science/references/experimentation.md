# Experimentation Deep Dive

## CUPED Implementation Details

CUPED works by computing an adjusted metric for each user:

```
Y_adjusted = Y - theta * (X - E[X])
```

Where `Y` is the experiment metric, `X` is the pre-experiment covariate, and `theta = Cov(Y, X) / Var(X)`.

### Practical Implementation Steps

1. **Choose your covariate**: Typically the same metric measured pre-experiment. If testing revenue impact, use pre-experiment revenue as the covariate.

2. **Set the lookback window**: How far back to look for pre-experiment data.
   - 1-2 weeks works for most engagement metrics
   - 42 days (6 weeks) for subscription/billing metrics to capture at least one billing cycle
   - Longer windows capture more noise and reduce the variance reduction benefit

3. **Handle the split ratio issue**: For equal 50/50 splits, the standard pooled estimator works. For unequal splits (90/10, 95/5), use:
   ```
   theta_weighted = (n_T * theta_T + n_C * theta_C) / (n_T + n_C)
   ```
   Where theta_T and theta_C are computed separately for treatment and control. The pooled estimator assumes equal variance, which breaks under unequal splits when treatment changes the Y-X correlation.

4. **Metrics without pre-experiment data**: About 12% of metrics won't have usable pre-experiment covariates (new features, new user segments). For these, CUPED can't help. Consider:
   - Using a correlated proxy metric as the covariate
   - Using CUPAC (Control Using Predictions As Covariate), which uses ML model predictions instead of raw pre-experiment data

### CUPAC (DoorDash's Extension)

Instead of using raw pre-experiment metric values, train an ML model to predict the experiment metric from pre-experiment features. Use the model's predictions as the covariate. This can capture more complex relationships than the linear CUPED adjustment.

## Sequential Testing

### The Peeking Problem

Classical hypothesis tests assume you look at results exactly once. Each peek inflates your false positive rate:

| Peeks | Nominal alpha | Actual alpha |
|-------|--------------|--------------|
| 1     | 0.05         | 0.05         |
| 5     | 0.05         | 0.14         |
| 10    | 0.05         | 0.19         |
| 100   | 0.05         | 0.30         |

### Solutions

**Confidence sequences (anytime-valid)**: Replace confidence intervals with confidence sequences that remain valid at all sample sizes. The sequence starts wide and narrows, but the coverage guarantee holds at every point. Netflix's implementation uses mixture sequential probability ratio tests.

**Alpha spending (group sequential)**: Pre-allocate your alpha budget across K planned interim analyses.
- **O'Brien-Fleming**: Conservative early, aggressive late. Spending: 0.0001, 0.004, 0.019, 0.043 for 4 looks
- **Pocock**: Equal spending at each look. More power to stop early, but final analysis uses stricter threshold
- **Lan-DeMets**: Flexible — you don't need to pre-specify when you'll look

**Practical recommendation**: Use anytime-valid inference as the default. It handles arbitrary peeking with no planning overhead. Use group sequential methods when you need maximum statistical power at planned decision points.

## Interference Detection

### LinkedIn's "A/B Test of A/B Tests"

To detect whether interference exists in your platform:

1. Run an experiment where the treatment is... running a different experiment at varying intensities
2. If outcomes change based on what fraction of nearby users are treated, interference exists
3. The magnitude of the interference effect tells you how biased standard A/B test estimates would be

### Cluster Randomization

When interference exists, randomize at a cluster level (city, social graph component, marketplace region). The tradeoff:
- **Reduces bias** from spillover effects
- **Increases variance** because you have fewer independent units
- **Requires more clusters** than you'd need individual users

Rule of thumb: you need at least 20-30 clusters per arm for reasonable power.

### Switchback Experiments

For marketplace/supply-constrained systems where clusters aren't feasible:

1. Alternate the entire system between treatment and control over time blocks
2. **Block length matters**: Too short = carryover effects dominate. Too long = low power.
3. **Carryover mitigation**: Exclude data from transition periods (first 10-30 minutes after switching, depending on the system's "memory")
4. **Analysis**: Use difference-in-differences or regression with time-block fixed effects

CUPED can reduce required experiment duration by 25-50% in switchback designs.

## Causal Inference Without Experiments

When you can't randomize, these are the standard approaches in order of credibility:

1. **Regression Discontinuity (RD)**: Strongest quasi-experimental design. Requires a sharp cutoff (credit score threshold, eligibility age). Estimates are local to the cutoff.

2. **Difference-in-Differences (DiD)**: Compare treated vs. untreated groups before and after an intervention. Requires the parallel trends assumption — groups would have followed similar trajectories absent treatment. Test this with pre-treatment data.

3. **Instrumental Variables (IV)**: Use an instrument that affects the outcome only through the treatment. The instrument must be relevant (correlated with treatment) and excludable (no direct effect on outcome). Weak instruments produce biased and imprecise estimates.

4. **Propensity Score Methods**: Match treated and untreated units on their probability of being treated. Only accounts for observed confounders. If unobservable factors drive treatment selection, estimates are biased.

5. **Interrupted Time Series (ITS)**: Model the pre-intervention trend and compare to post-intervention observations. Requires long pre-intervention time series and no concurrent events that could explain the change.

The general rule: the further down this list you go, the stronger the assumptions required and the less credible the causal claim.
