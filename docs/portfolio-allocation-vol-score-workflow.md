# Portfolio Allocation Vol Score and End-to-End Workflow

This document describes the current implementation of the portfolio allocation flow in:

- `src/app/(dashboard)/allocation/page.jsx`
- `src/app/api/realized-vol/route.js`
- `src/app/api/return-covariance/route.js`
- `src/app/api/allocation/route.js`

It is implementation-focused rather than theory-first. The goal is to explain exactly how the volatility score is calculated, where it gets written, and how it propagates through the optimizer from page load to final portfolio results.

Note: this file reflects the current code path. In the current implementation, the market and synthetic covariance matrices are trace-normalized before blending.

## Quick summary

The first factor, `Volatility`, is special. It is not treated like the other manual factor columns.

- The code assumes factor index `0` is the volatility factor.
- For every non-`CASH` ticker, the page fetches realized volatility from market data.
- It converts each ticker's realized vol into a relative cross-sectional score between 0 and 1.
- That score is written into `factorExposures[0]`.
- The full factor matrix, including that volatility score, is then used to build the synthetic covariance matrix.
- The synthetic covariance is blended with empirical return covariance.
- Monte Carlo simulation searches for feasible portfolios that maximize expected return per unit of hybrid risk.

In short:

```text
market prices
  -> realized annualized vol per ticker
  -> relative vol score in [0, 1]
  -> factorExposures[0]
  -> factor matrix E
  -> synthetic covariance
  -> hybrid covariance
  -> portfolio risk / score
```

## 1. Where the volatility score comes from

### 1.1 Trigger conditions

The auto-vol logic runs in the allocation page after the page has finished loading saved state.

- It derives `allocTickerKey` from the current ticker set.
- It excludes `CASH`.
- It sorts tickers before joining them, so row order does not matter.
- It debounces the fetch by 1 second.
- It does not rerun just because expected returns or manual factor values changed.

That means the vol score is refreshed when the ticker universe changes, not when the user edits other fields.

### 1.2 Realized vol API

The page calls:

```text
GET /api/realized-vol?tickers=...&days=252
```

The backend logic is:

1. Fetch daily close history from Yahoo Finance for each ticker.
2. Drop tickers with fewer than 20 closes.
3. Compute daily simple returns:

```text
r_t = (P_t - P_(t-1)) / P_(t-1)
```

4. Keep the last `days` returns.
5. Compute the mean of those returns.
6. Compute the population variance:

```text
var_i = (1 / N) * sum_t (r_t - mean_i)^2
```

7. Annualize:

```text
vol_i = sqrt(var_i) * sqrt(252)
```

The API returns:

```json
{
  "vols": {
    "AAPL": 0.32,
    "GOOGL": 0.28
  }
}
```

These are raw realized vols in annualized decimal units, not percentages.

### 1.3 Converting raw realized vol into a factor score

The page does not use raw vol directly as the factor exposure. It first scores each ticker relative to the other tickers currently on the page.

If fewer than 2 valid vols come back:

- every valid non-cash ticker gets `0.50`
- this means "neutral" because there is no meaningful cross-section to compare against

If there are at least 2 valid vols:

1. Compute the cross-sectional mean:

```text
mu = (1 / n) * sum_i vol_i
```

2. Compute the cross-sectional sample standard deviation:

```text
sigma_raw = sqrt((1 / (n - 1)) * sum_i (vol_i - mu)^2)
```

3. Apply a floor:

```text
sigma = max(sigma_raw, 0.05)
```

The `0.05` floor means 5 percentage points of annualized vol. This prevents tiny cross-sectional differences from exploding into extreme z-scores when all names have very similar realized volatility.

4. Compute a z-score per ticker:

```text
z_i = (vol_i - mu) / sigma
```

5. Compress the z-score by `0.5`:

```text
z_i_compressed = 0.5 * z_i
```

6. Map it through the standard normal CDF:

```text
score_i = Phi(z_i_compressed)
```

This gives a smooth score in `(0, 1)`.

Interpretation:

- `score_i > 0.50` means the ticker is higher-vol than the current peer set
- `score_i < 0.50` means the ticker is lower-vol than the current peer set
- `score_i ~= 0.50` means roughly average

### 1.4 Write-back into the factor matrix

The computed score is written to:

```text
row.factorExposures[0]
```

Important implementation detail:

- the code uses index `0`, not the factor name, to identify the vol factor
- this means the first factor in `riskFactors` must remain `Volatility`
- the stored value is rounded to 2 decimals via `toFixed(2)` before later simulation steps use it

So the actual optimizer usually sees values like `0.31`, `0.52`, `0.78`, not full-precision CDF outputs.

### 1.5 What happens in the UI

While the vol fetch is running:

- the `Volatility` input shows a spinner
- only the first factor column gets this treatment

After the score is written:

- the allocation state updates
- the normal auto-save flow persists the updated allocation config to Supabase

One nuance: the input is still technically editable. If a user manually changes the volatility field, that manual value can stay in state until the ticker set changes or the page reloads. On the next auto-vol refresh, the system-generated value overwrites it.

## 2. Full portfolio allocation workflow from start to finish

### 2.1 Page boot

When the page first mounts, it starts with local defaults:

- default tickers
- default factor exposures
- default factor weights
- default risk-free rate
- default weight constraints
- default lambda

Then it requests saved config from:

```text
GET /api/allocation
```

If a saved config exists, it replaces the defaults. If not, the defaults remain.

Once that load finishes, `loaded` is set to `true`.

### 2.2 Auto-save

After `loaded === true`, any change to:

- allocations
- factor weights
- risk-free rate
- min/max weights
- cash constraints
- number of portfolios
- lambda
- rebalancer target weights

is saved through a debounced:

```text
PUT /api/allocation
```

The save debounce is 800ms.

This matters because the auto-computed vol scores also flow through this same save path.

### 2.3 Auto-vol refresh

After load, and whenever the non-cash ticker set changes:

1. The page builds `allocTickerKey`.
2. Waits 1 second.
3. Calls `/api/realized-vol`.
4. Computes cross-sectional vol scores.
5. Writes those scores into `factorExposures[0]`.
6. Auto-save persists the new exposures.

At this point, the factor matrix already contains the system-generated volatility factor.

### 2.4 User input state before simulation

Before simulation runs, each row effectively contains:

- `ticker`
- `expectedReturn`
- `factorExposures`
- `userWeight`

The factor columns are:

1. `Volatility`
2. `Regulatory`
3. `Disruption`
4. `Valuation`
5. `Earnings Quality`

Only column 1 is auto-derived. The others are manual inputs.

### 2.5 Validation at simulation time

When the user clicks `Run Simulation`, the page:

1. Filters out fully empty rows.
2. Parses all numeric fields.
3. Converts percent inputs into decimals where needed.
4. Validates:

- ticker must exist
- expected return must be non-negative
- factor exposures must be non-negative
- user weights must be non-negative
- `CASH` must be present
- stock min/max bounds must be valid
- cash min/max bounds must be valid
- factor weights must be non-negative
- if user weights are provided, they must sum to 100%

If validation fails, the run stops and an error message is shown.

## 3. How the factor model uses the vol score

Once validation passes, the page builds:

- `assets`
- `expectedReturns`
- `factorMatrix`
- `userWeights`

The volatility score now sits inside the first column of `factorMatrix`.

### 3.1 Raw factor matrix

Call the raw exposure matrix:

```text
E[i][k]
```

where:

- `i` is the asset
- `k` is the factor

For the volatility column:

```text
E[i][0] = auto-computed vol score
```

For the other columns:

```text
E[i][1..4] = manual user inputs
```

### 3.2 Exposure matrix used directly

The raw exposure matrix `E` is used directly in the optimizer. `CASH` is forced to a zero row. There is no column normalization step — the [0, 1] factor values enter the covariance construction as-is.

### 3.3 Cross-sectional factor covariance

The page computes factor means across assets, centers the exposure matrix, then builds the factor covariance matrix:

```text
C[k][l] = covariance of E columns k and l across assets
```

This is cross-sectional covariance across names, not time-series covariance across dates.

### 3.4 Factor importance weighting

The user also sets factor importance weights:

```text
d_k
```

The code applies them as:

```text
W[k][l] = C[k][l] * d_k * d_l
```

### 3.5 Synthetic asset covariance

The synthetic covariance matrix is then:

```text
Sigma_composite = E * W * E^T
```

So the volatility score affects risk in two ways:

1. It changes the first column of `E`.
2. It changes how much the `Volatility` factor contributes to `Sigma_composite`, scaled by the volatility factor's importance weight.

## 4. Market covariance path

Separately, the page tries to build a classical return covariance matrix for the non-cash assets.

It calls:

```text
GET /api/return-covariance?tickers=...&days=252
```

That API:

1. Fetches daily closes from Yahoo Finance for each ticker.
2. Drops tickers with insufficient history.
3. Intersects dates so all remaining tickers share the same trading calendar.
4. Uses the last `days + 1` common dates.
5. Computes daily simple returns.
6. Computes the sample covariance matrix:

```text
Sigma_return[i][j] =
  (252 / (T - 1)) * sum_t (r_i_t - mean_i) * (r_j_t - mean_j)
```

7. Returns the annualized covariance matrix plus the valid ticker order.

Back in the page:

- the returned matrix is mapped into the local asset order
- any missing ticker stays zeroed out
- `CASH` stays zero
- the matrix is symmetrized

If the fetch fails, `Sigma_return` simply remains all zeros.

## 5. Hybrid covariance construction

After both paths are ready:

- `Sigma_composite` comes from the factor model
- `Sigma_return` comes from aligned historical returns

The code then trace-normalizes both matrices:

```text
trace(M) = sum_i M[i][i]

M_tilde = M / trace(M)    if trace(M) > 1e-12
M_tilde = M               otherwise
```

Then it blends them:

```text
Sigma_hybrid =
  lambda * Sigma_return_tilde
  + (1 - lambda) * Sigma_composite_tilde
```

Interpretation:

- `lambda = 1`: pure market covariance structure
- `lambda = 0`: pure factor-model covariance structure
- between 0 and 1: hybrid structure

This is the matrix used for portfolio risk in the optimizer.

Important: the resulting `volatility` shown by the simulator is hybrid risk, not plain historical volatility.

## 6. Monte Carlo optimization workflow

Once `Sigma_hybrid` exists, the simulation does the following:

1. Generate random weights.
2. Normalize them to sum to 1.
3. Reject portfolios that violate stock or cash constraints.
4. Compute expected return:

```text
ER(w) = sum_i w_i * expectedReturn_i
```

5. Compute hybrid variance:

```text
Var_hybrid(w) = w^T * Sigma_hybrid * w
```

6. Compute hybrid risk:

```text
Risk_hybrid(w) = sqrt(max(Var_hybrid(w), 0))
```

7. Compute the Sharpe-like score:

```text
Score(w) = (ER(w) - riskFreeRate) / Risk_hybrid(w)
```

8. Keep the portfolio in the simulation set.
9. Repeat until enough feasible portfolios are collected or the attempt cap is hit.

The attempt cap is:

```text
maxAttempts = targetPortfolios * 50
```

The reported winners are:

- max Sharpe-like portfolio
- min hybrid-risk portfolio
- optional metrics for the user-defined portfolio if user weights were entered

## 7. What the outputs mean

### 7.1 Efficient frontier chart

The scatter plot does not put raw hybrid risk directly on the x-axis. It min-max normalizes the simulated risk values into `[0, 1]`.

So:

- `x = 0` means lowest simulated hybrid risk in that run
- `x = 1` means highest simulated hybrid risk in that run

The y-axis is expected return.

### 7.2 Standalone composite risk

The page also computes a per-stock summary score:

```text
StandaloneRisk_i = (sum_k E[i][k] * d_k) / (sum_k d_k)
```

This is only a weighted average of raw factor exposures.

It is not:

- derived from `Sigma_hybrid`
- a marginal contribution to portfolio variance
- a pure market volatility number

The auto-computed volatility score directly affects this number through `E[i][0]`.

## 8. Important implementation notes and caveats

- The volatility factor is coupled to array position `0`. If factor ordering changes, the auto-vol logic will break semantically.
- The vol score is relative to the current ticker set. Adding or removing one ticker can change every other ticker's vol score.
- The score is a rank-like normalized exposure, not raw realized volatility.
- The stored exposure is rounded to 2 decimals before simulation.
- `CASH` is excluded from vol fetching and market covariance, and is represented as a zero row in the exposure matrix.
- If fewer than 2 valid tickers come back from the vol API, the system assigns `0.50`.
- If fewer than 2 valid non-cash tickers come back for return covariance, the market covariance path effectively drops out.
- The raw [0, 1] factor exposures are used directly — there is no column normalization step.
- The final portfolio "volatility" in the optimizer is best interpreted as hybrid covariance risk, not literal annualized historical volatility.

## 9. Short mental model

If you want the shortest correct description of what happens, it is this:

```text
The app measures each stock's realized volatility,
turns that into a relative 0-to-1 volatility factor score,
uses that score as the first factor exposure,
builds a synthetic risk matrix from all factor exposures and factor weights,
blends that with historical return covariance,
then Monte Carlo searches for portfolios with the best expected return per unit of blended risk.
```
