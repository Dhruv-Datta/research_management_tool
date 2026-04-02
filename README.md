# Portfolio Allocation Optimizer

This README documents the math behind the portfolio allocation optimizer in `src/app/(dashboard)/allocation/page.jsx`.

It is intentionally math-heavy and doubles as an audit. The goal is not just to restate the code, but to say what the code is actually optimizing, what assumptions it is making, and where the implementation is coherent versus where it is only an approximation of the intended idea.

## High-level verdict

The portfolio allocation optimizer is a hybrid risk engine. It blends two covariance views:

1. A **market covariance** estimated from historical daily returns (traditional Markowitz), scale-matched so it can be meaningfully combined with the synthetic side.
2. A **composite covariance** built from user-supplied factor exposures and importance weights (synthetic factor-risk scoring).

The `lambda` parameter (configurable in Settings as "Cov Blend Lambda") controls the mix. At `lambda = 1`, the optimizer is a traditional mean-variance engine. At `lambda = 0`, it is a pure synthetic factor-scoring engine. At intermediate values, the optimizer uses both empirical market data and subjective factor judgments to define risk.

## Code map

- `src/app/(dashboard)/allocation/page.jsx`
  Contains the optimizer, the synthetic covariance construction, the Monte Carlo search, and the rebalancer.
- `src/app/api/realized-vol/route.js`
  API endpoint that fetches historical prices and computes annualized realized volatility per ticker.
- `src/app/api/return-covariance/route.js`
  API endpoint that computes the annualized return covariance matrix from aligned daily returns across tickers.

## 1. Inputs and notation

Suppose there are `n` assets and `m` risk factors.

- Asset index: `i = 1, ..., n`
- Factor index: `k = 1, ..., m`
- User-entered expected return for asset `i`: `r_i`
- User-entered factor exposure of asset `i` to factor `k`: `E_{ik} >= 0`
- User-entered factor importance weight for factor `k`: `d_k >= 0`
- Portfolio weights: `w_i >= 0`, with `sum_i w_i = 1`

The code also forces a `CASH` row to exist if cash constraints are being used.

## 2. The optimizer objective actually used in code

For any sampled portfolio `w`, the code computes:

```text
ExpectedReturn(w) = sum_i w_i r_i

Variance_like(w) = w^T Sigma w

Volatility_like(w) = sqrt(max(w^T Sigma w, 0))

Sharpe_like(w) = (ExpectedReturn(w) - r_f) / Volatility_like(w)
```

where `r_f` is the user-entered risk-free rate and `Sigma` is the blended covariance matrix (see section 4).

Key interpretive points:

- `ExpectedReturn(w)` is a user belief input
- `Volatility_like(w)` is a blended risk score: part empirical return volatility (market side), part synthetic factor-exposure risk (composite side), controlled by `lambda`
- `Sharpe_like(w)` is therefore a hybrid metric — at `lambda = 1` it approaches a true Sharpe ratio, at `lambda = 0` it is a synthetic factor-scoring ratio

## 3. How the synthetic covariance matrix is built

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

## 4. Two asset-level covariance constructions

The code constructs two matrices with fundamentally different risk views:

1. A traditional return covariance matrix estimated from historical daily returns (Markowitz-style):

```text
r_{it} = (P_{it} - P_{i,t-1}) / P_{i,t-1}

Sigma_market[i][j] = (1 / (T-1)) * sum_t (r_{it} - r_i_bar)(r_{jt} - r_j_bar) * 252
```

where `T` is the number of common trading days (up to 252) and the factor of 252 annualizes. This is fetched from `/api/return-covariance` which aligns all tickers to a common date index and computes the sample covariance. CASH rows are zero throughout.

2. A multi-factor composite covariance using all factors scaled by importance weights:

```text
D = diag(d_1, ..., d_m)
C_weighted = D C D
Sigma_composite = B C_weighted B^T
```

This uses all `m` factors and their cross-sectional covariance structure, weighted by user-specified importance.

### 4.1 Scale-matching

The market and composite matrices live on different scales. Real return covariance has diagonal entries on the order of 0.04–0.17 (squared annualized vol), while the synthetic composite has entries on the order of 0.001–0.01. Blending them directly would let the market side dominate at any non-trivial lambda.

To make the blend meaningful, the market matrix is rescaled before blending:

```text
s = avg_i(Sigma_composite[i][i]) / avg_i(Sigma_market[i][i])     (non-CASH assets only)

Sigma_market_scaled = s * Sigma_market
```

This preserves the correlation structure from historical returns (which assets move together and by how much relative to each other) while matching the magnitude to the composite side.

### 4.2 Blending

The final covariance is:

```text
lambda in [0, 1]
Sigma = lambda * Sigma_market_scaled + (1 - lambda) * Sigma_composite
```

Interpretation:

- `Sigma_market_scaled` says "risk is what the market says it is" — real return covariance with empirical correlations
- `Sigma_composite` says "risk is what our multi-factor model says it is" — all factors with subjective importance weights
- `lambda = 0` → full composite (your judgment drives risk)
- `lambda = 1` → full market (only historical return data matters)
- `lambda` interpolates between those two views

## 5. Why this matrix is mathematically valid

Both sides of the blend are positive semidefinite, and so is the result.

For the composite side:

- `C` is a sample covariance matrix, so it is positive semidefinite
- `C_weighted = D C D` is also positive semidefinite when `D` is diagonal with nonnegative entries
- For any matrix `B`, `B C_weighted B^T` is positive semidefinite

For the market side:

- `Sigma_market` is a sample covariance matrix of returns, which is positive semidefinite by construction
- Multiplying by a positive scalar (the scale factor) preserves positive semidefiniteness

For the blend:

- A convex combination of positive semidefinite matrices is positive semidefinite

Therefore:

```text
for any vector x,
x^T Sigma x >= 0
```

So the optimizer's risk score cannot become negative except for floating-point noise.

At `lambda = 1`, `Sigma` is a scaled version of a real return covariance matrix, so the optimizer is financially calibrated (modulo the scale factor). At intermediate lambda values, the blend mixes empirical and synthetic risk views. At `lambda = 0`, the risk score is purely synthetic and should not be interpreted as return volatility in the usual sense.

## 6. Standalone per-stock risk

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

It is a scalar summary score.

## 7. Auto-computed volatility score

The optimizer automatically computes a volatility factor exposure (the first column of the factor exposure matrix, index `k = 0`) from realized market data rather than relying on a manual user input. This score feeds directly into the synthetic covariance construction described in sections 3 and 4.

### 7.1 Realized volatility computation

For each non-cash ticker `i`, the system fetches 252 trading days of daily closing prices from Yahoo Finance and computes annualized realized volatility:

```text
r_t = (close_t - close_{t-1}) / close_{t-1}

vol_i = sqrt(var(r)) * sqrt(252)
```

where `var(r)` is the population variance of the daily return series.

### 7.2 Cross-sectional distribution fitting

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

### 7.3 Score computation

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

### 7.4 Interpretation

The score is the percentile rank of a ticker's realized vol within the portfolio's cross-sectional vol distribution, under a Gaussian assumption with compression.

- `score ~ 0.50`: ticker vol is near the portfolio average (neutral)
- `score > 0.50`: ticker is higher-vol than peers (penalized in the optimizer via larger factor exposure)
- `score < 0.50`: ticker is lower-vol than peers (rewarded)

Key properties:

1. **Relative, not absolute.** A high-vol portfolio where every ticker has 40%+ annualized vol will still produce scores clustered around 0.5, because the distribution is fitted to the cross-section. Only relative differences within the portfolio matter.

2. **Robust to tight clustering.** When the vol spread is small (`sigma_raw < 5%`), the floor ensures all scores stay near 0.5 rather than amplifying noise.

3. **Bounded and smooth.** The CDF is monotonically increasing and asymptotically flat, so the score degrades gracefully for extreme outliers rather than blowing up.

4. **Multiple tickers can share similar scores.** If several tickers have similar realized vol, they will have similar z-scores and therefore similar scores. The mapping does not force a uniform spread — it reflects the actual shape of the vol distribution.

### 7.5 Integration with the optimizer

The computed `score_i` is written directly into `factorExposures[0]` (the Volatility column) of each allocation row. This value then enters the factor exposure matrix `E` at column `k = 0` and propagates through the normalization, covariance construction, and Monte Carlo search described in sections 3 through 8.

The score is recomputed automatically (with a 1-second debounce) whenever the ticker list changes. A loading indicator is shown on the Volatility input while the computation is in progress. The user can manually override the auto-computed value after it is set.

## 8. Monte Carlo search over feasible portfolios

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

## 9. What the frontier chart means

The chart labels are slightly more ambitious than the actual math.

The plotted `x` coordinate is not raw `sqrt(w^T Sigma w)`. The code first min-max normalizes volatility across the simulated cloud:

```text
CompositeRisk(w) =
    (Volatility_like(w) - min Volatility_like)
    / (max Volatility_like - min Volatility_like)
```

So the x-axis is a rank-like normalized synthetic risk score on `[0, 1]` within the sampled cloud.

Likewise, the code's displayed "Composite Ratio" is just min-max normalized Sharpe-like score over the same cloud. The actual portfolio selected as "Max Composite Ratio" is still the portfolio with highest Sharpe-like score, so the argmax is unchanged, but the displayed ratio is not a fundamental object from portfolio theory.

## 10. What this optimizer is really doing

The optimizer is a blend of two approaches, controlled by `lambda`:

- At `lambda = 1`: "Find feasible weights that maximize expected return per unit of empirical return volatility" — this is classical Markowitz mean-variance optimization (via Monte Carlo search rather than analytical solution).
- At `lambda = 0`: "Find feasible weights that maximize expected return per unit of synthetic factor-exposure dispersion" — this is a custom factor-scoring optimizer.
- At intermediate values: the optimizer interpolates between these two views of risk.

The default `lambda = 0.3` means the optimizer is 30% market-driven and 70% factor-model-driven.

## 11. Audit

### 11.1 What is mathematically coherent

- Both the market and composite covariance matrices are positive semidefinite, and the blend preserves this property.
- The scale-matching ensures the lambda blend is meaningful rather than one side dominating.
- The auto-computed vol score is statistically well-founded: CDF of a fitted normal with compression and a std floor.
- The Monte Carlo search correctly identifies the argmax of the Sharpe-like score over the feasible set.
- At `lambda = 1`, the optimizer is a legitimate (if approximate) Markowitz mean-variance optimizer.

### 11.2 Findings

| Severity | Area | Finding | Why it matters |
| :--- | :--- | :--- | :--- |
| Medium | Scale-matching | The market matrix is rescaled by avg-variance ratio to match the composite side. | This is a reasonable heuristic but not the only valid approach. It preserves correlations exactly but distorts the absolute risk level. At `lambda = 1`, the optimizer's "volatility" is not in real return units — it is in composite-scale units. |
| Medium | Composite covariance | The optimizer normalizes factor columns by cross-sectional sums before computing covariance. | Uniformly scaling a whole factor column leaves the covariance unchanged, so common factor level is ignored. Only relative exposure shares matter. |
| Medium | Cash handling | `CASH` defaults to expected return `0`, while the score subtracts a positive risk-free rate. | Cash is treated as zero-risk but not as earning the risk-free rate unless the user manually enters that expected return. That biases the optimizer against cash. |
| Low | Sampling | The Monte Carlo optimizer samples normalized `Uniform(0,1)` draws. | That does not induce a uniform distribution on the simplex. Frontier coverage is therefore approximate and biased by the sampler. |
| Low | UI naming | "Composite Risk" and "Composite Ratio" in the chart are min-max normalized display scores, not fundamental quantities. | The display is directionally useful, but the names overstate the mathematical meaning of those numbers. |
| Low | Graceful degradation | If the return covariance fetch fails, the market matrix is zero and the blend falls back to pure composite regardless of lambda. | This is silent — the user may not notice. |

### 11.3 Does the optimizer do what it says it is trying to do?

Yes. The optimizer now genuinely blends empirical market risk with subjective factor-model risk, controlled by lambda. At `lambda = 1` it is a real (scale-adjusted) Markowitz optimizer. At `lambda = 0` it is a pure factor-scoring optimizer. At intermediate values it interpolates between the two.

## 12. Settings reference

The following parameters are configurable in the Settings panel:

| Parameter | Default | Description |
| :--- | :--- | :--- |
| Risk-Free Rate | 4% | Subtracted from expected return in the Sharpe-like score |
| Number of Portfolios | 100,000 | Monte Carlo samples to generate |
| Stock Min Weight | 3% | Minimum allocation per non-cash asset |
| Stock Max Weight | 15% | Maximum allocation per non-cash asset |
| Cash Min Weight | 1% | Minimum cash allocation |
| Cash Max Weight | 5% | Maximum cash allocation |
| Cov Blend Lambda | 0.3 | Blend between market (`1`) and composite (`0`) covariance. At `0` the optimizer uses only the synthetic factor model. At `1` it uses only the empirical return covariance from historical data. |
| Risk Factor Weights | Vol: 0.9, Reg: 0.3, Disr: 0.7, Val: 0.6, EQ: 0.8 | Importance weights applied to the composite covariance side |

## 13. Recommended next fixes

1. Treat `CASH` expected return explicitly as the risk-free rate when that is the intended semantics.
2. If frontier sampling quality matters, replace normalized uniform draws with a proper simplex sampler such as Dirichlet draws.
3. Consider surfacing a warning in the UI when the return covariance fetch fails and the market side silently falls back to zero.
