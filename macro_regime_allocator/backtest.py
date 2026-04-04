"""
Allocation logic and walk-forward backtest engine.

Allocation pipeline: model probabilities → sigmoid amplification → crash overlay
→ asymmetric smoothing → weight caps.

Backtest: monthly rebalancing, trains on realized labels only, applies crash
overlay using current (unlagged) market data for fast defensive switching.
"""

import os
import numpy as np
import pandas as pd
from config import Config
from model import RegimeClassifier


# ── Allocation ──────────────────────────────────────────────────────────────

def sigmoid_weight_map(p_equity: float, cfg: Config) -> float:
    """Map P(equity outperforms) through a steep sigmoid biased toward the baseline."""
    bias = np.log(cfg.equal_weight[0] / cfg.equal_weight[1])
    x = (p_equity - 0.5) * cfg.allocation_steepness + bias
    return 1.0 / (1.0 + np.exp(-x))


def crash_overlay(equity_weight: float, market_data: dict, cfg: Config) -> tuple:
    """
    Defensive overlay using current (unlagged) market conditions.
    Reacts to ACTIVE deterioration, not static levels.
    Returns (adjusted_weight, reason_string).
    """
    if not cfg.crash_overlay or not market_data:
        return equity_weight, "none"

    penalties = []
    vix_change = market_data.get("vix_1m_change")
    vix_ts = market_data.get("vix_term_structure")

    # VIX spike: sharp jump = crash unfolding
    if vix_change is not None and vix_change > cfg.vix_spike_threshold:
        severity = min((vix_change - cfg.vix_spike_threshold) / 15.0, 1.0)
        penalties.append(("vix_spike", severity * 0.50))

    # VIX backwardation + rising = panic mode
    if (vix_ts is not None and vix_ts > 1.08
            and vix_change is not None and vix_change > 3.0):
        severity = min((vix_ts - 1.08) * 5.0, 1.0)
        penalties.append(("vix_panic", severity * 0.35))

    # Drawdown accelerating with VIX stress confirmation
    drawdown = market_data.get("equity_drawdown_from_high")
    dd_change = market_data.get("drawdown_1m_change")
    if (drawdown is not None and drawdown < cfg.drawdown_defense_threshold
            and dd_change is not None and dd_change < -4.0
            and vix_ts is not None and vix_ts > 0.98):
        severity = min(-dd_change / 10.0, 1.0)
        penalties.append(("drawdown_crash", severity * 0.30))

    if not penalties:
        return equity_weight, "none"

    total_penalty = min(sum(p for _, p in penalties), 0.50)
    reasons = "+".join(name for name, _ in penalties)
    return equity_weight * (1.0 - total_penalty), reasons


def probabilities_to_weights(probabilities: np.ndarray, cfg: Config,
                             market_data: dict = None) -> tuple:
    """Full pipeline: probabilities → sigmoid → crash overlay → caps."""
    raw = probabilities.copy()
    eq_w = sigmoid_weight_map(probabilities[0], cfg)
    eq_w, overlay_reason = crash_overlay(eq_w, market_data or {}, cfg)

    # Cap and normalize
    eq_w = np.clip(eq_w, cfg.min_weight, cfg.max_weight)
    weights = np.array([eq_w, 1.0 - eq_w])
    return raw, weights, overlay_reason


# ── Sample Weighting ────────────────────────────────────────────────────────

def _recency_weights(n: int, halflife: int) -> np.ndarray:
    decay = np.log(2) / halflife
    return np.exp(-decay * np.arange(n)[::-1])


def _class_balanced_weights(y: np.ndarray) -> np.ndarray:
    classes, counts = np.unique(y, return_counts=True)
    n, n_c = len(y), len(classes)
    cw = {c: n / (n_c * cnt) for c, cnt in zip(classes, counts)}
    return np.array([cw[yi] for yi in y])


# ── Market Data for Crash Overlay ───────────────────────────────────────────

def _gather_market_data(merged: pd.DataFrame, rebalance_date) -> dict:
    """Collect current (unlagged) market signals — all 12 model features + overlay signals."""
    if rebalance_date not in merged.index:
        return {}

    md = {}
    row = merged.loc[rebalance_date]
    rd_loc = merged.index.get_loc(rebalance_date)

    # ── All 12 model features (mirrors data.py engineer_features) ──

    # 1. Inflation YoY
    cpi_col = "cpi" if "cpi" in merged.columns else "core_cpi"
    if cpi_col in merged.columns and rd_loc >= 12:
        cpi_now = merged[cpi_col].iloc[rd_loc]
        cpi_12 = merged[cpi_col].iloc[rd_loc - 12]
        if pd.notna(cpi_now) and pd.notna(cpi_12) and cpi_12 > 0:
            md["inflation_yoy"] = (cpi_now / cpi_12 - 1) * 100

    # 2. Inflation Impulse
    if cpi_col in merged.columns and rd_loc >= 12:
        cpi_now = merged[cpi_col].iloc[rd_loc]
        cpi_3 = merged[cpi_col].iloc[max(0, rd_loc - 3)]
        if pd.notna(cpi_now) and pd.notna(cpi_3) and cpi_3 > 0:
            impulse = ((cpi_now / cpi_3) ** 4 - 1) * 100 - md.get("inflation_yoy", 0)
            md["inflation_impulse"] = impulse

    # 3. Unemployment Rate
    if "unemployment" in merged.columns:
        v = row.get("unemployment")
        if pd.notna(v):
            md["unemployment_rate"] = float(v)

    # 4. Credit Spread Level
    if "credit_spread" in merged.columns:
        v = row.get("credit_spread")
        if pd.notna(v):
            md["credit_spread_level"] = float(v)

    # 5. Credit Spread 3M Change
    if "credit_spread" in merged.columns and rd_loc >= 3:
        md["credit_spread_3m_change"] = float(
            merged["credit_spread"].iloc[rd_loc] - merged["credit_spread"].iloc[rd_loc - 3]
        )

    # 6. Real Fed Funds
    if "fed_funds" in merged.columns and cpi_col in merged.columns and rd_loc >= 12:
        ff = row.get("fed_funds")
        cpi_now = merged[cpi_col].iloc[rd_loc]
        cpi_12 = merged[cpi_col].iloc[rd_loc - 12]
        if pd.notna(ff) and pd.notna(cpi_now) and pd.notna(cpi_12) and cpi_12 > 0:
            md["real_fed_funds"] = float(ff) - (cpi_now / cpi_12 - 1) * 100

    # 7. Yield Curve Slope
    if "treasury_10y" in merged.columns and "treasury_2y" in merged.columns:
        t10 = row.get("treasury_10y")
        t2 = row.get("treasury_2y")
        if pd.notna(t10) and pd.notna(t2):
            md["yield_curve_slope"] = float(t10) - float(t2)

    # 8. VIX 1-Month Change
    if "vix" in merged.columns and rd_loc > 0:
        md["vix_1m_change"] = float(
            merged["vix"].iloc[rd_loc] - merged["vix"].iloc[rd_loc - 1]
        )

    # 9. VIX Term Structure
    if "vix" in merged.columns and "vix3m" in merged.columns:
        v, v3 = row.get("vix"), row.get("vix3m")
        if pd.notna(v) and pd.notna(v3) and v3 > 0:
            md["vix_term_structure"] = float(v) / float(v3)

    # 10. Equity Momentum 3M
    if "equity" in merged.columns and rd_loc >= 3:
        eq_now = merged["equity"].iloc[rd_loc]
        eq_3 = merged["equity"].iloc[rd_loc - 3]
        if pd.notna(eq_now) and pd.notna(eq_3) and eq_3 > 0:
            md["equity_momentum_3m"] = (eq_now / eq_3 - 1) * 100

    # 11. Equity Volatility 3M
    if "equity" in merged.columns and rd_loc >= 3:
        rets = merged["equity"].pct_change().iloc[max(0, rd_loc - 2):rd_loc + 1]
        if len(rets.dropna()) >= 2:
            md["equity_vol_3m"] = float(rets.std() * np.sqrt(12) * 100)

    # 12. Equity Drawdown from High
    if "equity" in merged.columns:
        lookback = max(0, rd_loc - 11)
        rolling_high = merged["equity"].iloc[lookback:rd_loc + 1].max()
        if rolling_high > 0:
            dd_now = (row["equity"] / rolling_high - 1) * 100
            md["equity_drawdown_from_high"] = float(dd_now)
            if rd_loc > 0:
                prev_lookback = max(0, rd_loc - 12)
                prev_high = merged["equity"].iloc[prev_lookback:rd_loc].max()
                if prev_high > 0:
                    dd_prev = (merged["equity"].iloc[rd_loc - 1] / prev_high - 1) * 100
                    md["drawdown_1m_change"] = float(dd_now - dd_prev)

    return md


# ── Walk-Forward Backtest ───────────────────────────────────────────────────

def run_backtest(features: pd.DataFrame, labels: pd.DataFrame, cfg: Config) -> dict:
    """
    Walk-forward backtest with monthly rebalancing.

    At each month t:
      1. Train on labels up to t - horizon (only fully realized)
      2. Predict probability of equity outperformance
      3. Map to weights via sigmoid + crash overlay + smoothing
      4. Earn 1-month return
    """
    # Prepare features: drop rows with any NaN
    valid_mask = features.notna().all(axis=1)
    features = features.loc[valid_mask].copy()

    # Labels are only needed for training — prediction universe is all valid features
    y_all = labels["label"]

    print(f"Backtest universe: {len(features)} months from "
          f"{features.index[0].strftime('%Y-%m')} to "
          f"{features.index[-1].strftime('%Y-%m')}")

    # Load merged data for returns and overlay signals
    merged = pd.read_csv(os.path.join(cfg.data_dir, "merged_monthly.csv"),
                         index_col="date", parse_dates=True)

    monthly_returns = pd.DataFrame(index=merged.index)
    monthly_returns["equity"] = merged["equity"].pct_change()
    rate_col = cfg.tbills_rate_series
    if rate_col not in merged.columns:
        raise ValueError(f"T-bills rate series '{rate_col}' not found in data.")
    monthly_returns["tbills"] = merged[rate_col].shift(1) / 100 / 12

    X = features
    all_dates = X.index.tolist()
    horizon = cfg.forecast_horizon_months
    ew = np.array(cfg.equal_weight)

    results = []
    prev_equity_weight = cfg.equal_weight[0]

    # Step size: for horizon > 1, skip forward by horizon months to avoid
    # overlapping holding periods (each decision holds for `horizon` months).
    for i in range(cfg.min_train_months, len(all_dates), horizon):
        rebalance_date = all_dates[i]

        # Only train on labels whose forward window is fully realized
        # Label at i-horizon has forward window ending at i, which is realized
        # at prediction time i (we observe month i's close before predicting)
        train_end = i - horizon + 1
        if train_end < 1:
            continue

        # ── Train ───────────────────────────────────────────────────────
        train_start = 0 if cfg.window_type == "expanding" else max(0, train_end - cfg.rolling_window_months)
        train_idx = all_dates[train_start:train_end]
        # Only use dates that have labels for training
        train_idx_with_labels = [d for d in train_idx if d in y_all.index]
        X_train = X.loc[train_idx_with_labels]
        y_train = y_all.loc[train_idx_with_labels]

        if len(y_train) < cfg.min_train_months or y_train.nunique() < 2:
            continue

        sw = _recency_weights(len(train_idx_with_labels), cfg.recency_halflife_months)
        cw = _class_balanced_weights(y_train.values)
        model = RegimeClassifier(cfg)
        model.fit(X_train, y_train, sample_weight=sw * cw)

        # ── Predict & allocate ──────────────────────────────────────────
        proba = model.predict_proba(X.loc[[rebalance_date]])[0]
        pred_class = np.argmax(proba)

        market_data = _gather_market_data(merged, rebalance_date)
        _, weights, overlay_reason = probabilities_to_weights(proba, cfg, market_data)

        # Asymmetric smoothing: slow ramp up, instant defense
        target_eq = weights[0]
        alpha = cfg.weight_smoothing_up if target_eq >= prev_equity_weight else cfg.weight_smoothing_down
        smoothed_eq = np.clip(alpha * target_eq + (1 - alpha) * prev_equity_weight,
                              cfg.min_weight, cfg.max_weight)
        weights = np.array([smoothed_eq, 1.0 - smoothed_eq])
        prev_equity_weight = smoothed_eq

        # ── Realized returns over the full holding period ──────────────
        # Compound monthly returns for `horizon` months (or fewer at end)
        next_dates = [d for d in all_dates[i + 1 : i + 1 + horizon]
                      if d in monthly_returns.index]
        cum_eq = 1.0
        cum_tb = 1.0
        valid_months = 0
        for hd in next_dates:
            ret_eq_m = monthly_returns.loc[hd, "equity"]
            ret_tb_m = monthly_returns.loc[hd, "tbills"]
            if np.isnan(ret_eq_m) or np.isnan(ret_tb_m):
                break
            cum_eq *= (1 + ret_eq_m)
            cum_tb *= (1 + ret_tb_m)
            valid_months += 1

        if valid_months == 0:
            # No realized returns yet (e.g. last month) — still record the prediction
            results.append({
                "rebalance_date": rebalance_date,
                "return_date": rebalance_date,
                "pred_class": pred_class,
                "actual_label": np.nan,
                "prob_equity": proba[0],
                "prob_tbills": proba[1],
                "weight_equity": weights[0],
                "weight_tbills": weights[1],
                "overlay": overlay_reason,
                "ret_equity": np.nan,
                "ret_tbills": np.nan,
                "port_return": np.nan,
                "ew_return": np.nan,
                "ret_6040": np.nan,
                "train_size": train_end,
            })
            continue

        ret_eq = cum_eq - 1
        ret_tbills = cum_tb - 1
        realized = np.array([ret_eq, ret_tbills])
        actual_label = y_all.loc[rebalance_date] if rebalance_date in y_all.index else np.nan

        results.append({
            "rebalance_date": rebalance_date,
            "return_date": next_dates[valid_months - 1],
            "pred_class": pred_class,
            "actual_label": actual_label,
            "prob_equity": proba[0],
            "prob_tbills": proba[1],
            "weight_equity": weights[0],
            "weight_tbills": weights[1],
            "overlay": overlay_reason,
            "ret_equity": ret_eq,
            "ret_tbills": ret_tbills,
            "port_return": np.dot(weights, realized),
            "ew_return": np.dot(ew, realized),
            "ret_6040": 0.60 * ret_eq + 0.40 * ret_tbills,
            "train_size": train_end,
        })

    print(f"  Predictions made: {len(results)}")
    if not results:
        raise RuntimeError("No predictions were made. Check data availability.")

    bt = pd.DataFrame(results).set_index("return_date")
    bt.index.name = "date"

    # Filter to only include predictions from start_date onward
    bt = bt[bt.index >= pd.Timestamp(cfg.start_date)]
    print(f"  Predictions after start_date ({cfg.start_date}): {len(bt)}")
    if bt.empty:
        raise RuntimeError(f"No predictions on or after start_date {cfg.start_date}.")

    # Cumulative series (starts at 1.0 on the first date)
    # Fill NaN returns with 0 for cumprod (unrealized months don't affect cumulative)
    cum_cols = []
    for col, src in [("cum_port", "port_return"), ("cum_ew", "ew_return"),
                     ("cum_equity", "ret_equity"), ("cum_tbills", "ret_tbills"),
                     ("cum_6040", "ret_6040")]:
        bt[col] = 100 * (1 + bt[src].fillna(0)).cumprod()
        cum_cols.append(col)

    # Prepend a $1.00 starting row so charts begin at 1.0
    start_date = bt.index[0] - pd.DateOffset(months=1)
    start_row = pd.DataFrame(
        {c: [100.0] if c in cum_cols else [np.nan] for c in bt.columns},
        index=pd.DatetimeIndex([start_date], name="date"),
    )
    bt = pd.concat([start_row, bt])

    bt["turnover"] = bt[["weight_equity", "weight_tbills"]].diff().abs().sum(axis=1)
    bt["turnover"] = bt["turnover"].fillna(0)

    # Save backtest results
    os.makedirs(cfg.output_dir, exist_ok=True)
    bt.to_csv(os.path.join(cfg.output_dir, "backtest_results.csv"))
    print(f"  Backtest results saved to {cfg.output_dir}/")

    # Train final model on all available data
    final_model = RegimeClassifier(cfg)
    final_idx = all_dates[:len(all_dates) - horizon]
    y_final = y_all.loc[y_all.index.isin(final_idx)].dropna()
    common = X.index.intersection(y_final.index)
    sw = _recency_weights(len(common), cfg.recency_halflife_months)
    cw = _class_balanced_weights(y_all.loc[common].values)
    final_model.fit(X.loc[common], y_all.loc[common], sample_weight=sw * cw)
    final_model.save_model()

    return {"backtest": bt, "final_model": final_model,
            "prev_equity_weight": prev_equity_weight}
