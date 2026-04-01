# Portfolio Allocation and Market Confidence

This README documents the math behind two connected systems in this repo:

1. The portfolio allocation optimizer in `src/app/(dashboard)/allocation/page.jsx`
2. The market confidence / macro regime pipeline in `macro_regime_allocator/` and `src/app/(dashboard)/macro-regime/page.jsx`

It is intentionally math-heavy and doubles as an audit. The goal is not just to restate the code, but to say what the code is actually optimizing, what assumptions it is making, and where the implementation is coherent versus where it is only an approximation of the intended idea.

## High-level verdict

The macro regime allocator is internally coherent as a walk-forward binary classifier that maps a macro probability into an equity/T-bill mix, then optionally applies a fast defensive overlay and smoothing.

The portfolio allocation optimizer is mathematically coherent as a synthetic factor-risk scoring engine, but it is not a classical mean-variance optimizer in the Markowitz sense because its "covariance" is not estimated from time-series asset returns. Its risk number is better interpreted as a custom exposure-based risk score.

The stock-level macro-adjusted weights logic is a second-stage overlay. It does not reuse the optimizer's full covariance matrix or frontier. It only reuses the per-stock standalone risk concept from the allocation page, combines it with realized volatility, and then trims or boosts names depending on the macro signal.

## Code map

- `src/app/(dashboard)/allocation/page.jsx`
  Contains the optimizer, the synthetic covariance construction, the Monte Carlo search, and the rebalancer.
- `src/app/(dashboard)/macro-regime/page.jsx`
  Contains the stock-level derisk overlay and the dashboard interpretation of the macro signal.
- `macro_regime_allocator/data.py`
  Downloads macro and market data, engineers features, and builds labels.
- `macro_regime_allocator/model.py`
  Defines the logistic regression classifier.
- `macro_regime_allocator/backtest.py`
  Defines probability-to-weight mapping, crash overlay, smoothing, and walk-forward backtesting.
- `macro_regime_allocator/main.py`
  Runs the pipeline and produces the live prediction used by the UI.
- `src/lib/macroRegimeSignal.js`
  Converts saved model output into the UI signal used by the Market Confidence page.

## 1. Portfolio allocation optimizer

### 1.1 Inputs and notation

Suppose there are `n` assets and `m` risk factors.

- Asset index: `i = 1, ..., n`
- Factor index: `k = 1, ..., m`
- User-entered expected return for asset `i`: `r_i`
- User-entered factor exposure of asset `i` to factor `k`: `E_{ik} >= 0`
- User-entered factor importance weight for factor `k`: `d_k >= 0`
- Portfolio weights: `w_i >= 0`, with `sum_i w_i = 1`

The code also forces a `CASH` row to exist if cash constraints are being used.

### 1.2 The optimizer objective actually used in code

For any sampled portfolio `w`, the code computes:

```text
ExpectedReturn(w) = sum_i w_i r_i

Variance_like(w) = w^T Sigma w

Volatility_like(w) = sqrt(max(w^T Sigma w, 0))

Sharpe_like(w) = (ExpectedReturn(w) - r_f) / Volatility_like(w)
```

where `r_f` is the user-entered risk-free rate and `Sigma` is a synthetic matrix built from factor exposures, not return data.

This is the single most important interpretive point:

- `ExpectedReturn(w)` is a user belief input
- `Volatility_like(w)` is a custom exposure-risk score
- `Sharpe_like(w)` is therefore not a literal empirical Sharpe ratio

It is still a valid optimization score, but it is not "expected excess return divided by estimated return volatility" in the usual finance sense.

### 1.3 How the synthetic covariance matrix is built

The code first assembles the factor exposure matrix:

```text
E in R^(n x m),   E_{ik} = exposure of asset i to factor k
```

It then normalizes each factor column by its cross-sectional total:

```text
S_k = sum_i E_{ik}
B_{ik} = E_{ik} / S_k    if S_k > 0
B_{ik} = 0               otherwise
```

Call `B` the normalized factor matrix.

This normalization has a strong implication:

- Only relative cross-sectional exposure within a factor matters
- The absolute level of a factor column disappears

If every asset's volatility exposure is multiplied by the same constant, `B` does not change, so the optimizer's covariance structure does not change.

The code then computes factor means:

```text
mu_k = (1 / n) * sum_i B_{ik}
```

and the factor covariance matrix across assets:

```text
C_{kl} = (1 / (n - 1)) * sum_i (B_{ik} - mu_k)(B_{il} - mu_l)
```

This is a covariance across the cross-section of assets, not across time.

### 1.4 Two asset-level covariance constructions

The code constructs two matrices:

1. An unweighted factor covariance projection:

```text
Sigma_market = B C B^T
```

2. A factor-importance-weighted projection:

```text
D = diag(d_1, ..., d_m)
C_weighted = D C D
Sigma_composite = B C_weighted B^T
```

and then blends them:

```text
lambda in [0, 1]
Sigma = lambda * Sigma_market + (1 - lambda) * Sigma_composite
```

Interpretation:

- `Sigma_market` says "treat the factor covariance structure as-is"
- `Sigma_composite` says "rescale factor covariance by user importance weights"
- `lambda` interpolates between those two views

### 1.5 Why this matrix is mathematically valid

Even though `Sigma` is not a return covariance matrix, it is mathematically well-formed.

Reason:

- `C` is a sample covariance matrix, so it is positive semidefinite
- `C_weighted = D C D` is also positive semidefinite when `D` is diagonal with nonnegative entries
- For any matrix `B`, both `B C B^T` and `B C_weighted B^T` are positive semidefinite
- A convex combination of positive semidefinite matrices is positive semidefinite

Therefore:

```text
for any vector x,
x^T Sigma x >= 0
```

So the optimizer's risk score cannot become negative except for floating-point noise.

That is the good news.

The important caveat is that positive semidefinite does not imply financially calibrated. It only implies internal mathematical consistency.

### 1.6 Standalone per-stock risk

The allocation page also computes a simpler per-stock score:

```text
StandaloneRisk_i = (sum_k d_k E_{ik}) / (sum_k d_k)
```

This is just a weighted average of raw factor exposures.

It is not:

- marginal contribution to variance
- beta
- expected shortfall contribution
- anything derived from `Sigma`

It is a scalar summary score. The Market Confidence page later reuses exactly this idea.

### 1.7 Auto-computed volatility score

The optimizer automatically computes a volatility factor exposure (the first column of the factor exposure matrix, index `k = 0`) from realized market data rather than relying on a manual user input. This score feeds directly into the synthetic covariance construction described in sections 1.3 and 1.4.

#### 1.7.1 Realized volatility computation

For each non-cash ticker `i`, the system fetches 252 trading days of daily closing prices from Yahoo Finance and computes annualized realized volatility:

```text
r_t = (close_t - close_{t-1}) / close_{t-1}

vol_i = sqrt(var(r)) * sqrt(252)
```

where `var(r)` is the population variance of the daily return series.

#### 1.7.2 Cross-sectional distribution fitting

The system treats the set of realized vols `{vol_1, ..., vol_n}` as a sample from a normal distribution and estimates its parameters:

```text
mu = (1/n) * sum_i vol_i

sigma_raw = sqrt( (1/(n-1)) * sum_i (vol_i - mu)^2 )
```

using Bessel-corrected sample variance.

A standard deviation floor is applied:

```text
sigma_eff = max(sigma_raw, 0.05)
```

The 5% floor prevents degenerate behavior when all tickers have similar volatility. Without it, a cross-section like `{29%, 30%, 30%, 31%}` would have `sigma_raw = 0.74%`, and a 1% absolute vol difference would produce a z-score above 1. The floor ensures that vol differences smaller than ~5% annualized are treated as immaterial, collapsing all scores toward 0.5.

#### 1.7.3 Score computation

Each ticker's realized vol is converted to a score via the standard normal CDF with a compression factor:

```text
z_i = (vol_i - mu) / sigma_eff

score_i = Phi(kappa * z_i)
```

where `Phi` is the standard normal CDF (approximated via the Abramowitz & Stegun rational approximation, `|error| < 1.5e-7`) and `kappa = 0.5` is the compression factor.

The CDF maps any real-valued input to `(0, 1)` by construction. The compression factor halves the z-score before the CDF, which prevents outlier tickers from saturating near 0 or 1.

Effective output ranges at different z-scores:

```text
z = -2   =>  Phi(-1.0) = 0.159   (low vol, 2 sigma below mean)
z = -1   =>  Phi(-0.5) = 0.309
z =  0   =>  Phi( 0.0) = 0.500   (at the mean)
z = +1   =>  Phi(+0.5) = 0.691
z = +2   =>  Phi(+1.0) = 0.841   (high vol, 2 sigma above mean)
```

#### 1.7.4 Interpretation

The score is the percentile rank of a ticker's realized vol within the portfolio's cross-sectional vol distribution, under a Gaussian assumption with compression.

- `score ~ 0.50`: ticker vol is near the portfolio average (neutral)
- `score > 0.50`: ticker is higher-vol than peers (penalized in the optimizer via larger factor exposure)
- `score < 0.50`: ticker is lower-vol than peers (rewarded)

Key properties:

1. **Relative, not absolute.** A high-vol portfolio where every ticker has 40%+ annualized vol will still produce scores clustered around 0.5, because the distribution is fitted to the cross-section. Only relative differences within the portfolio matter.

2. **Robust to tight clustering.** When the vol spread is small (`sigma_raw < 5%`), the floor ensures all scores stay near 0.5 rather than amplifying noise.

3. **Bounded and smooth.** The CDF is monotonically increasing and asymptotically flat, so the score degrades gracefully for extreme outliers rather than blowing up.

4. **Multiple tickers can share similar scores.** If several tickers have similar realized vol, they will have similar z-scores and therefore similar scores. The mapping does not force a uniform spread — it reflects the actual shape of the vol distribution.

#### 1.7.5 Integration with the optimizer

The computed `score_i` is written directly into `factorExposures[0]` (the Volatility column) of each allocation row. This value then enters the factor exposure matrix `E` at column `k = 0` and propagates through the normalization, covariance construction, and Monte Carlo search described in sections 1.3 through 1.8 (now 1.4 through 1.8).

The score is recomputed automatically (with a 1-second debounce) whenever the ticker list changes. A loading indicator is shown on the Volatility input while the computation is in progress. The user can manually override the auto-computed value after it is set.

### 1.8 Monte Carlo search over feasible portfolios

The optimizer does not solve a continuous constrained optimization problem analytically. It does a random search.

For each simulation:

1. Draw `u_i ~ Uniform(0, 1)`
2. Normalize:

```text
w_i = u_i / sum_j u_j
```

3. Reject the sample if it violates:

```text
min_weight <= w_i <= max_weight       for non-cash assets
cash_min_weight <= w_cash <= cash_max_weight
```

4. Compute return, synthetic volatility, and Sharpe-like score
5. Keep the best Sharpe-like and lowest-volatility portfolios

So the feasible set is:

```text
W = { w : sum_i w_i = 1, w_i >= 0, box constraints on stock and cash weights }
```

and the search is an acceptance-rejection Monte Carlo scan of `W`.

### 1.9 What the frontier chart means

The chart labels are slightly more ambitious than the actual math.

The plotted `x` coordinate is not raw `sqrt(w^T Sigma w)`. The code first min-max normalizes volatility across the simulated cloud:

```text
CompositeRisk(w) =
    (Volatility_like(w) - min Volatility_like)
    / (max Volatility_like - min Volatility_like)
```

So the x-axis is a rank-like normalized synthetic risk score on `[0, 1]` within the sampled cloud.

Likewise, the code's displayed "Composite Ratio" is just min-max normalized Sharpe-like score over the same cloud. The actual portfolio selected as "Max Composite Ratio" is still the portfolio with highest Sharpe-like score, so the argmax is unchanged, but the displayed ratio is not a fundamental object from portfolio theory.

### 1.10 What this optimizer is really doing

Mathematically, the allocation page is closer to:

"Find feasible weights that maximize user-expected return per unit of synthetic factor-exposure dispersion"

than to:

"Estimate a return covariance matrix and solve a Markowitz efficient frontier"

That does not make it wrong. It just changes how results should be interpreted.

## 2. Market Confidence / macro regime allocator

This system is structurally much closer to a standard supervised learning pipeline.

### 2.1 Label construction

The model is binary:

- Class `0`: equity beats T-bills over the forecast horizon
- Class `1`: T-bills beat or tie equity over the forecast horizon

For horizon `H` months:

```text
fwd_ret_equity(t) =
    Price_equity(t + H) / Price_equity(t) - 1
```

For T-bills, the code compounds the monthly fed funds proxy:

```text
r_ff(s) = FEDFUNDS(s) / 100 / 12

fwd_ret_tbills(t) =
    prod_{j = 0}^{H - 1} (1 + r_ff(t + j)) - 1
```

Then the label is:

```text
y_t = 1    if fwd_ret_tbills(t) >= fwd_ret_equity(t)
y_t = 0    otherwise
```

The tie-breaking rule goes to T-bills.

### 2.2 Feature engineering

The feature vector is built from macro and market series, then uniformly lagged by `macro_lag_months`.

Representative examples:

- inflation year-over-year
- inflation impulse
- unemployment rate
- credit spread level
- credit spread 3-month change
- real fed funds
- yield curve slope
- VIX 1-month change
- VIX term structure
- equity momentum
- equity volatility
- equity drawdown from high

Formally, if `x_t` denotes the raw feature vector, the model sees:

```text
X_t = x_{t - L}
```

where `L = macro_lag_months`.

This is a good anti-lookahead design choice. The classifier does not use same-month macro data that would not have been available at rebalance time.

### 2.3 Logistic regression model

The classifier is logistic regression on standardized features.

If `z_t` is the standardized feature vector:

```text
z_t = (X_t - mu) / s
```

the model estimates:

```text
P(y_t = 1 | z_t) = sigma(beta_0 + beta^T z_t)
```

where:

```text
sigma(a) = 1 / (1 + exp(-a))
```

Because class `1` is T-bills and class `0` is equity:

```text
P_equity(t) = P(y_t = 0 | z_t)
P_tbills(t) = P(y_t = 1 | z_t)
```

The code correctly uses `proba[0]` as the equity probability because scikit-learn returns probabilities in class-label order `[0, 1]`.

### 2.4 Sample weighting in training

Each training row gets a multiplicative sample weight:

```text
weight_t = recency_weight_t * class_balance_weight_t
```

The recency piece is exponential decay:

```text
recency_weight_t = exp(-log(2) * age_t / halflife)
```

so every `halflife` months, effective weight halves.

The class-balance piece is the standard inverse-frequency formula:

```text
class_balance_weight(c) = N / (K * N_c)
```

where:

- `N` is total training size
- `K` is number of classes
- `N_c` is the count of class `c`

This gives recent and minority-class observations more influence.

### 2.5 Walk-forward backtest logic

At each rebalance date `t`, the code:

1. Trains only on labels whose forward outcomes are already fully realized
2. Predicts `P_equity(t)` and `P_tbills(t)`
3. Converts the probability into portfolio weights
4. Realizes returns over the next `H` months

Crucially, training only runs through `t - H`, not through `t`, so the backtest is not cheating on the label window.

For `H > 1`, the loop steps forward by `H` months to avoid overlapping holding periods. That is a defensible walk-forward design.

## 3. From macro probability to equity/T-bill weights

The main nonlinear map is:

```text
b = baseline equity weight
1 - b = baseline T-bill weight
k = allocation_steepness
p = P_equity

bias = log(b / (1 - b))
x = k * (p - 0.5) + bias
w_eq_raw = sigma(x)
```

This construction has a useful property:

```text
if p = 0.5, then w_eq_raw = b
```

So a 50/50 class probability does not imply a 50/50 portfolio. It implies the configured baseline allocation.

With the current default config:

- `b = 0.95`
- `k = 13`

the mapping is very aggressive:

- `p = 0.50` gives `w_eq_raw = 0.95`
- `p approx 0.2735` gives `w_eq_raw = 0.50`
- `p approx 0.5409` already gives `w_eq_raw approx 0.97`, which then hits the max cap

So the system is deliberately biased toward staying invested in equity unless the model becomes materially bearish.

### 3.1 Caps

After the sigmoid map, the equity weight is clipped:

```text
w_eq = clip(w_eq_raw, min_weight, max_weight)
w_tb = 1 - w_eq
```

This makes the allocator long-only and bounded away from 0 and 1.

### 3.2 Crash overlay

Separately from the lagged-feature classifier, the code computes current market stress indicators at rebalance time and applies a one-sided penalty to equity weight.

Penalties are additive up to a 50 percent cut:

```text
penalty_total = min(sum_j penalty_j, 0.50)
w_eq_overlay = w_eq * (1 - penalty_total)
```

The triggers are:

- VIX spike
- VIX panic / backwardation regime
- drawdown acceleration confirmed by VIX stress

This is important conceptually:

- the classifier is lagged and predictive
- the crash overlay is contemporaneous and reactive

So the final allocator is a hybrid of slow macro forecasting and fast market defense.

### 3.3 Smoothing

After the overlay, the code smooths the target weight against the previous equity weight:

```text
alpha =
    weight_smoothing_up     if target_eq >= prev_eq
    weight_smoothing_down   otherwise

smoothed_eq = clip(alpha * target_eq + (1 - alpha) * prev_eq,
                   min_weight, max_weight)
```

Interpretation:

- if `alpha` is close to `1`, the system moves quickly to the new target
- if `alpha` is close to `0`, the system moves slowly

This matters in the audit section because some comments in code describe the behavior in the opposite direction.

## 4. How the Market Confidence page ties back to the allocation page

The Market Confidence page has two different layers:

1. The macro allocator from Python outputs a scalar regime signal
2. The React overlay uses that scalar to tilt the stock-level portfolio

The scalar sent into the stock overlay is:

```text
M = predict.equityWeight
```

This is not the raw classifier probability. It is already the final macro equity allocation after:

- logistic probability mapping
- equity weight caps
- crash overlay
- smoothing

So `M` is a post-processed macro confidence score.

### 4.1 Shared risk ontology

The stock overlay reuses the allocation page's per-stock standalone risk idea:

```text
CompRisk_i = (sum_k d_k E_{ik}) / (sum_k d_k)
```

where the same factor exposures `E_{ik}` and factor weights `d_k` come from the saved allocation config.

That is the main mathematical bridge between the two pages.

### 4.2 Added realized volatility channel

The stock overlay also computes a realized annualized volatility score from market data:

```text
Vol_i = annualized stdev of daily returns over the chosen lookback
```

If realized vol is unavailable, it falls back to the first factor exposure.

Then both cross-sectional channels are min-max normalized:

```text
VolNorm_i = (Vol_i - min_j Vol_j) / (max_j Vol_j - min_j Vol_j)
CompNorm_i = (CompRisk_i - min_j CompRisk_j) / (max_j CompRisk_j - min_j CompRisk_j)
```

and blended:

```text
Agg_i = alpha * VolNorm_i + (1 - alpha) * CompNorm_i
```

`Agg_i` is not expected return, variance contribution, or beta. It is an ordinal aggressiveness score.

### 4.3 From macro signal to derisk strength

Let `d0 = derisk_start`. The overlay defines:

```text
D = max(0, (d0 - M) / d0)
```

So:

- if `M >= d0`, then `D = 0` and the overlay does nothing
- if `M < d0`, then `D` rises linearly as the macro signal weakens

This is a one-sided overlay. It derisks in weak regimes but does not lever or add extra risk in strong regimes.

### 4.4 Cross-sectional trim and redistribution

Let `w_i^base` be the base stock weights, excluding cash.

First center aggressiveness:

```text
Z_i = Agg_i - mean_j Agg_j
```

Then split into aggressive and defensive sides:

```text
AggSide_i = max(0, Z_i)
DefSide_i = max(0, -Z_i)
```

Then scale each side by its cross-sectional max so the largest name on each side gets `1`.

Trim aggressive names:

```text
w_i^trim = w_i^base * (1 - max_trim * D * AggScaled_i)
```

Removed weight:

```text
R = sum_i (w_i^base - w_i^trim)
```

Target cash:

```text
cash_target = cash_min + D * (cash_max - cash_min)
```

but only the weight actually freed by trimming can go to cash:

```text
cash_extra = min(max(0, cash_target - cash_base), R)
cash_new = cash_base + cash_extra
redistribute = R - cash_extra
```

Remaining removed weight is redistributed to defensive names in proportion to `DefScaled_i`:

```text
w_i^new = w_i^trim + redistribute * DefScaled_i / sum_j DefScaled_j
```

Then the code applies per-name bounds relative to base weight:

```text
lower_i = w_i^base * (1 - max_trim)
upper_i = w_i^base * (1 + max_boost)
w_i^bounded = clip(w_i^new, lower_i, upper_i)
```

Finally it renormalizes the stock book so stocks sum to `1 - cash_new`.

That last step is mathematically necessary to close the budget, but it has an audit implication: renormalization can undo the exactness of the earlier per-name bounds.

## 5. Audit

### 5.1 What is mathematically coherent

- The macro classifier avoids label leakage in the walk-forward loop.
- The logistic probability map is internally consistent and anchored to the configured baseline.
- The crash overlay is structurally sensible as a one-sided defensive layer.
- The optimizer's synthetic covariance matrix is positive semidefinite, so the risk score is mathematically valid.
- The stock-level macro overlay is internally consistent as a conservative cross-sectional trim/boost engine.

### 5.2 Findings

| Severity | Area | Finding | Why it matters |
| :--- | :--- | :--- | :--- |
| High | Allocation optimizer | The optimizer's `volatility` and `sharpe` are synthetic, not empirical return volatility and Sharpe. | This is fine if intentional, but the UI and names make it easy to interpret the frontier as a classical efficient frontier when it is really a factor-exposure scoring surface. |
| High | Market Confidence tie-in | The stock overlay uses `M = equityWeight`, not raw `probEquity`. | The stock-level derisking responds to an already transformed, capped, crash-adjusted, and smoothed signal. That compresses information and makes the second-stage overlay less directly tied to model probability than the UI wording suggests. |
| High | Macro allocation nonlinearity | With baseline `95/5` and steepness `13`, the sigmoid saturates very quickly. | `P_equity approx 0.5409` already implies the max 97 percent equity cap, while `P_equity = 0.5` already implies 95 percent equity. This is a strong design choice and should be understood as such. |
| Medium | Optimizer covariance construction | The optimizer normalizes factor columns by cross-sectional sums before computing covariance. | Uniformly scaling a whole factor column leaves the covariance unchanged, so common factor level is ignored. Only relative exposure shares matter. |
| Medium | Cash handling in optimizer | `CASH` defaults to expected return `0`, while the score subtracts a positive risk-free rate. | Cash is treated as zero-risk but not as earning the risk-free rate unless the user manually enters that expected return. That biases the optimizer against cash. |
| Medium | Smoothing semantics | The smoothing formula implies `alpha near 1` means fast movement, but code comments describe "slow ramp up" with large default `weight_smoothing_up`. | The implementation and the natural interpretation of the parameter do not match the comment. The code is almost unsmoothed at current defaults. |
| Medium | Stock overlay bounds | The overlay clips names to relative trim/boost bounds and then renormalizes. | The final renormalization can push names back outside the intended pre-renormalization bounds. The bounds are therefore soft, not exact. |
| Medium | Market Confidence config | `credit_spike_threshold` is exposed in config and UI but is not used in the crash overlay logic. | This is a dead parameter and can mislead the user into thinking credit stress is directly affecting allocation when it currently does not. |
| Low | Sampling | The Monte Carlo optimizer samples normalized `Uniform(0,1)` draws. | That does not induce a uniform distribution on the simplex. Frontier coverage is therefore approximate and biased by the sampler. |
| Low | UI naming | "Composite Risk" and "Composite Ratio" in the chart are min-max normalized display scores, not fundamental quantities. | The display is directionally useful, but the names overstate the mathematical meaning of those numbers. |
| Low | Stock overlay input validation | The stock overlay assumes base weights are already normalized to 100 percent. | The page visually indicates non-100 totals but does not strictly enforce normalization before applying the overlay. |
| Low | UI text | The standalone risk card displays `lambda`, but standalone risk itself does not use `lambda`. | This is a wording mismatch, not a core logic bug. |

### 5.3 Does the system do what it says it is trying to do?

For the macro side: yes, mostly.

It is clearly trying to answer:

"Given lagged macro and market state, should the equity-vs-T-bill mix be more defensive next period?"

and the implementation does that in a disciplined walk-forward way.

For the allocation page: yes, but only if you interpret it correctly.

It is not estimating a true covariance of asset returns. It is building a user-guided synthetic risk geometry from factor exposures, then searching for feasible portfolios with strong expected return per unit of that synthetic risk.

For the stock-level macro-adjusted weights: yes, with a narrower scope than the UI may suggest.

It is not solving a new optimizer. It is applying a conservative overlay that:

- trims names considered aggressive
- redirects some of that weight to cash
- reallocates the rest toward names considered defensive

using the macro allocator's final equity weight as the trigger strength.

## 6. Recommended interpretation and next fixes

If the current design is intentional, the safest interpretation is:

- The allocation page is a custom factor-scoring optimizer
- The macro allocator is a separate regime model
- The Market Confidence overlay is a stock-level derisk heuristic layered on top

If the goal is to make the system more mathematically faithful to standard portfolio theory, the highest-value fixes would be:

1. Decide whether the allocation page should be a true return-covariance optimizer or an explicit synthetic factor optimizer, then name it accordingly.
2. If keeping the synthetic optimizer, relabel `volatility` and `sharpe` to something like `composite_risk` and `excess_return_per_risk`.
3. Decide whether the stock overlay should react to raw `probEquity` or to post-processed `equityWeight`.
4. Fix the smoothing comments or invert the smoothing formula if the intended behavior is actually "slow ramp up, fast defense."
5. Either wire `credit_spike_threshold` into the crash overlay or remove it from the UI.
6. Treat `CASH` expected return explicitly as the risk-free rate when that is the intended semantics.
7. If frontier sampling quality matters, replace normalized uniform draws with a proper simplex sampler such as Dirichlet draws.

## Bottom line

The codebase contains a coherent macro allocation system and a coherent synthetic stock-level derisk overlay, but the portfolio optimizer should not be read as a textbook mean-variance engine. The deepest mathematical connection between the allocation page and the Market Confidence page is not the full optimizer. It is the shared per-stock composite risk score built from the same factor exposures and factor weights.

That shared risk ontology is real. The rest of the tie-in is looser: the macro model produces a scalar regime score, and the frontend uses that scalar to modulate stock-level tilts and cash. That design makes practical sense, but it is a two-stage heuristic architecture, not a single unified optimization problem.
