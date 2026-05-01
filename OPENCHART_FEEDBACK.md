# OpenChart Platform Feedback

Post-mortem from the `texas-schools-crisis` report session (2026-04-09/10).

## DX Issues (Not Bugs, But Friction)

### 5. No way to selectively highlight table cells without coloring ALL cells

`categoryColors` auto-assigns theme palette colors to any value not in the explicit map. If you want to highlight 3 out of 8 rows, you have to explicitly set the other 5 to `"transparent"`. This is tedious and fragile (adding a new row means updating the transparent list).

**Suggestion:** Only color cells that have an explicit entry in the `categoryColors` map. Unmatched values should be unstyled by default. Auto-assignment from the theme palette should require an opt-in flag like `categoryColors: { _autoAssign: true, "active": "#22c55e" }` or be a separate feature.

### 6. Legend + endpoint labels are always both on by default

For multi-series line charts, endpoint labels make the legend redundant, but both render by default. Every chart in this report needed explicit `legend: { show: false }` or `labels: { density: "none" }`. The engine could detect when both are present and auto-suppress the legend for line/area charts with endpoint labels.

### 7. `layer` charts are hard to get right

Converting the recapture area chart to a `layer` chart (to overlay an inflation baseline line) produced broken rendering. The second layer's data rendered at completely wrong scale positions. The layer API needs better documentation or examples showing how shared vs independent scales work. I ended up rolling the layer attempt back entirely.

### 8. No `mark: "lollipop"` documentation in the main skill

The lollipop mark is mentioned in the rules but the actual spec API (accepted encodings, orientation, styling) isn't documented in any reference file. Had to guess at the encoding pattern.

### 9. Grouped bar requires non-obvious `stack: null`

To get grouped (side-by-side) bars instead of stacked bars, you need `stack: null` on the y encoding. This isn't intuitive. `stack: false` doesn't work. The chart selection decision tree says "stacked bar" for categorical + series + num, but doesn't mention how to get grouped bars.

### 10. Y-axis gridlines default to only min/max, not enough intermediate ticks

The engine defaults to showing very few y-axis gridlines (often just 0 and the max value). This makes it hard to read intermediate values from the chart. Every chart in this report needed an explicit `tickCount: 5` added to the y-axis config. The engine should have a smarter default based on available chart height, targeting ~4-5 gridlines for standard heights (~400px) and scaling up or down from there. Having to manually specify `tickCount` on every single chart is friction that should be handled by a sensible default.

## Positive Notes

- The `seriesStyles` API is clean and works well for differentiating series (dashed national avg, thicker Texas line).
- `annotations` with `refline` type are easy to use and render well.
- The `chrome` API (title, subtitle, source) is straightforward.
- `condition` color encoding for diverging bars works as documented.
- Dark mode auto-detection works well for most charts.
