# Robustness Validation Report

*Generated 2026-03-25 22:16*

## 1. Parameter Sensitivity

| Param | Value | Sharpe | Excess Sharpe | CAGR | Max DD | Calmar | Excess Calmar |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | - | 0.810 | +0.286 | 8.83% | -27.5% | 0.321 | +0.178 |
| regularization_C | 0.25 | 0.789 | +0.265 | 8.72% | -28.4% | 0.307 | +0.164 |
| regularization_C | 0.375 | 0.804 | +0.280 | 8.81% | -27.7% | 0.318 | +0.174 |
| regularization_C | 0.45 | 0.808 | +0.285 | 8.83% | -27.6% | 0.320 | +0.177 |
| regularization_C | 0.55 | 0.811 | +0.288 | 8.83% | -27.5% | 0.322 | +0.178 |
| regularization_C | 0.625 | 0.813 | +0.290 | 8.83% | -27.4% | 0.322 | +0.179 |
| regularization_C | 0.75 | 0.815 | +0.292 | 8.82% | -27.3% | 0.323 | +0.179 |
| allocation_steepness | 6.5 | 0.686 | +0.163 | 8.17% | -35.6% | 0.229 | +0.086 |
| allocation_steepness | 9.75 | 0.763 | +0.240 | 8.64% | -30.6% | 0.282 | +0.138 |
| allocation_steepness | 11.7 | 0.797 | +0.274 | 8.80% | -28.3% | 0.311 | +0.167 |
| allocation_steepness | 14.3 | 0.813 | +0.290 | 8.78% | -27.4% | 0.320 | +0.177 |
| allocation_steepness | 16.25 | 0.810 | +0.287 | 8.64% | -27.5% | 0.314 | +0.171 |
| allocation_steepness | 19.5 | 0.803 | +0.280 | 8.45% | -27.4% | 0.308 | +0.165 |
| recency_halflife_months | 6 | 0.818 | +0.295 | 8.74% | -28.9% | 0.303 | +0.159 |
| recency_halflife_months | 9 | 0.816 | +0.293 | 8.83% | -28.1% | 0.314 | +0.171 |
| recency_halflife_months | 11 | 0.812 | +0.289 | 8.84% | -27.7% | 0.319 | +0.176 |
| recency_halflife_months | 13 | 0.807 | +0.284 | 8.83% | -27.3% | 0.323 | +0.180 |
| recency_halflife_months | 15 | 0.803 | +0.280 | 8.82% | -27.0% | 0.327 | +0.184 |
| recency_halflife_months | 18 | 0.799 | +0.275 | 8.81% | -26.6% | 0.332 | +0.188 |
| min_train_months | 24 | 0.693 | +0.271 | 7.78% | -32.5% | 0.240 | +0.121 |
| min_train_months | 36 | 0.725 | +0.282 | 8.04% | -31.0% | 0.259 | +0.135 |
| min_train_months | 43 | 0.764 | +0.276 | 8.52% | -29.1% | 0.293 | +0.157 |
| min_train_months | 53 | 0.846 | +0.235 | 9.29% | -27.5% | 0.338 | +0.172 |
| min_train_months | 60 | 0.889 | +0.267 | 9.80% | -27.5% | 0.356 | +0.187 |
| min_train_months | 72 | 1.017 | +0.283 | 10.71% | -27.5% | 0.389 | +0.199 |
| weight_smoothing_down | 0.82 | 0.791 | +0.268 | 8.71% | -28.5% | 0.305 | +0.162 |
| weight_smoothing_down | 0.89 | 0.800 | +0.277 | 8.77% | -28.0% | 0.313 | +0.169 |
| weight_smoothing_down | 0.94 | 0.806 | +0.283 | 8.81% | -27.7% | 0.318 | +0.175 |
| weight_smoothing_down | 0.98 | 0.811 | +0.288 | 8.84% | -27.4% | 0.322 | +0.179 |
| weight_smoothing_down | 0.99 | 0.812 | +0.289 | 8.85% | -27.4% | 0.323 | +0.180 |
| weight_smoothing_down | 1.0 | 0.813 | +0.290 | 8.85% | -27.3% | 0.324 | +0.181 |
| weight_smoothing_up | 0.83 | 0.827 | +0.304 | 8.89% | -25.6% | 0.347 | +0.203 |
| weight_smoothing_up | 0.9 | 0.819 | +0.296 | 8.86% | -26.5% | 0.334 | +0.191 |
| weight_smoothing_up | 0.95 | 0.813 | +0.290 | 8.85% | -27.1% | 0.326 | +0.183 |
| weight_smoothing_up | 0.99 | 0.809 | +0.285 | 8.83% | -27.6% | 0.320 | +0.176 |

## 2. Ablation Studies

| Variant | Sharpe | Excess Sharpe | CAGR | Max DD | Calmar | Excess Calmar |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| full_system | 0.810 | +0.286 | 8.83% | -27.5% | 0.321 | +0.178 |
| no_crash_overlay | 0.769 | +0.246 | 8.68% | -32.3% | 0.269 | +0.125 |
| no_smoothing | 0.811 | +0.287 | 8.85% | -27.6% | 0.321 | +0.178 |
| no_recency_weighting | 0.737 | +0.214 | 8.47% | -29.9% | 0.284 | +0.140 |
| model_only | 0.769 | +0.246 | 8.69% | -32.5% | 0.267 | +0.124 |
| baseline_50_50 | 0.745 | +0.091 | 6.42% | -22.1% | 0.290 | +0.126 |
| baseline_60_40 | 0.763 | +0.151 | 6.89% | -23.2% | 0.297 | +0.141 |
| baseline_75_25 | 0.786 | +0.219 | 7.57% | -24.9% | 0.304 | +0.156 |
| baseline_95_5 | 0.810 | +0.286 | 8.83% | -27.5% | 0.321 | +0.178 |

## 3. Subperiod Analysis

| Period | Sharpe | Excess Sharpe | CAGR | Max DD | Excess CAGR | Calmar | Excess Calmar | Months |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| full_period | 0.865 | +0.245 | 10.09% | -27.5% | 1.36% | 0.367 | +0.188 | 297 |
| 2000s | 0.505 | +0.463 | 5.68% | -27.5% | 5.05% | 0.206 | +0.194 | 103 |
| 2010s | 1.094 | +0.011 | 11.62% | -13.2% | -1.18% | 0.882 | +0.054 | 120 |
| 2020s | 1.016 | +0.138 | 13.99% | -15.3% | -0.14% | 0.911 | +0.292 | 74 |
| ex_2008_crisis | 0.918 | +0.113 | 10.39% | -24.2% | -0.16% | 0.429 | +0.084 | 273 |
| ex_2020_covid | 0.906 | +0.244 | 10.41% | -27.5% | 1.36% | 0.379 | +0.193 | 291 |
| ex_both_crises | 0.968 | +0.099 | 10.75% | -24.2% | -0.20% | 0.444 | +0.085 | 267 |
| in_sample | 0.810 | +0.286 | 8.83% | -27.5% | 1.83% | 0.321 | +0.178 | 223 |
| holdout | 1.016 | +0.138 | 13.99% | -15.3% | -0.14% | 0.911 | +0.292 | 74 |

## 4. Bootstrap Confidence Intervals

| Metric | Mean | Std | 5th | 25th | 50th | 75th | 95th |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| sharpe | 0.8182 | 0.2773 | 0.3639 | 0.6340 | 0.8255 | 1.0011 | 1.2885 |
| excess_sharpe | 0.2670 | 0.1582 | 0.0279 | 0.1396 | 0.2669 | 0.3722 | 0.5404 |
| excess_cagr | 0.0178 | 0.0193 | -0.0089 | 0.0028 | 0.0161 | 0.0296 | 0.0538 |

## 5. Coefficient Stability

| Feature | Mean Coef | Change Std | Max Jump | Spike Freq | Instability |
| :--- | ---: | ---: | ---: | ---: | ---: |
| inflation_yoy | +0.0546 | 0.0641 | 0.2953 | 24.75% | 0.623 |
| inflation_impulse | +0.1543 | 0.0725 | 0.2825 | 23.73% | 0.777 |
| unemployment_rate | -0.0397 | 0.0609 | 0.2642 | 26.10% | 0.546 |
| credit_spread_level | +0.0824 | 0.0462 | 0.1897 | 22.37% | 0.123 |
| credit_spread_3m_change | +0.1011 | 0.0584 | 0.2701 | 25.08% | 0.446 |
| real_fed_funds | -0.0242 | 0.0563 | 0.2521 | 22.03% | 0.238 |
| yield_curve_slope | -0.0047 | 0.0621 | 0.2635 | 22.37% | 0.446 |
| vix_1m_change | -0.0472 | 0.0692 | 0.3599 | 26.10% | 0.892 |
| vix_term_structure | -0.0591 | 0.0675 | 0.5208 | 37.29% | 0.862 |
| equity_momentum_3m | +0.2037 | 0.0595 | 0.2497 | 18.64% | 0.277 |
| equity_vol_3m | -0.0245 | 0.0679 | 0.2997 | 22.37% | 0.715 |
| equity_drawdown_from_high | -0.0101 | 0.0488 | 0.2492 | 25.42% | 0.277 |
| equity_intramonth_dd | +0.1348 | 0.0666 | 0.5276 | 25.08% | 0.777 |

## 6. Defensive Accuracy

*Does the model defend when it matters and ride the wave when it should?*

| Metric | Value | Detail |
| :--- | ---: | :--- |
| Crisis hit rate | 65.5% | Went defensive in worst 29 equity months (bottom 10%) |
| Calm ride rate | 63.8% | Stayed invested when equity beat T-bills |
| Cost of false defense | 63.61% | Return given up on 68 false alarms |
| Defense payoff | 84.23% | Losses avoided on 43 correct defensive calls |
| Payoff ratio | 1.32x | Saved / cost (higher = better) |