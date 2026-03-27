"""
Evaluation metrics and plot generation for backtest results.
"""

import os
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from sklearn.metrics import (
    accuracy_score, balanced_accuracy_score,
    confusion_matrix, classification_report,
)
from config import Config
from model import RegimeClassifier


# ── Investment Metrics ──────────────────────────────────────────────────────

def _investment_metrics(returns: pd.Series, label: str) -> dict:
    n_months = len(returns)
    n_years = n_months / 12
    cum_ret = (1 + returns).prod()
    cagr = cum_ret ** (1 / n_years) - 1 if n_years > 0 else 0
    vol = returns.std() * np.sqrt(12)
    sharpe = cagr / vol if vol > 0 else 0
    cum = (1 + returns).cumprod()
    drawdowns = cum / cum.cummax() - 1
    max_dd = drawdowns.min()
    hit_rate = (returns > 0).mean()

    # Sortino (downside deviation)
    downside = returns[returns < 0]
    downside_std = downside.std() * np.sqrt(12) if len(downside) > 1 else vol
    sortino = cagr / downside_std if downside_std > 0 else 0

    # Calmar (CAGR / |max drawdown|)
    calmar = cagr / abs(max_dd) if max_dd != 0 else 0

    # VaR and CVaR (95%)
    var_95 = np.percentile(returns, 5)
    cvar_95 = returns[returns <= var_95].mean() if (returns <= var_95).any() else var_95

    # Best / worst months
    best_month = returns.max()
    worst_month = returns.min()

    # Max drawdown duration (months)
    in_dd = drawdowns < 0
    dd_groups = (~in_dd).cumsum()
    dd_durations = in_dd.groupby(dd_groups).sum()
    max_dd_duration = int(dd_durations.max()) if len(dd_durations) > 0 else 0

    # Winning / losing streaks
    signs = (returns > 0).astype(int)
    streaks = signs.groupby((signs != signs.shift()).cumsum())
    win_streak = max((len(g) for _, g in streaks if g.iloc[0] == 1), default=0)
    lose_streak = max((len(g) for _, g in streaks if g.iloc[0] == 0), default=0)

    # Average up month / average down month
    avg_up = returns[returns > 0].mean() if (returns > 0).any() else 0
    avg_down = returns[returns < 0].mean() if (returns < 0).any() else 0

    # Up/down capture ratio
    up_down_ratio = abs(avg_up / avg_down) if avg_down != 0 else float("inf")

    return {
        "label": label, "cagr": cagr, "volatility": vol, "sharpe": sharpe,
        "sortino": sortino, "calmar": calmar,
        "max_drawdown": max_dd, "max_dd_duration": max_dd_duration,
        "var_95": var_95, "cvar_95": cvar_95,
        "hit_rate": hit_rate, "total_return": cum_ret - 1,
        "best_month": best_month, "worst_month": worst_month,
        "avg_up_month": avg_up, "avg_down_month": avg_down,
        "up_down_ratio": up_down_ratio,
        "win_streak": win_streak, "lose_streak": lose_streak,
        "n_months": n_months,
    }


# ── Report Export ──────────────────────────────────────────────────────────

def _fmt_pct(v, decimals=2):
    return f"{v * 100:.{decimals}f}%"

def _fmt_f(v, decimals=2):
    return f"{v:.{decimals}f}"


def _save_report(bt, inv_df, annual_data, coefs, eq_w, overlay_stats, cfg,
                 dir_acc, weighted_acc, upside_cap, downside_cap,
                 clf_acc, bal_acc, cm_df, ew_label, defensive_metrics):
    """Write a full performance report to outputs/report.md."""
    from datetime import datetime
    lines = []
    w = lines.append

    w(f"# Macro Regime Allocator — Performance Report")
    w(f"")
    w(f"*Generated {datetime.now().strftime('%Y-%m-%d %H:%M')}*")
    w(f"")
    w(f"**Config:** equity={cfg.asset_tickers['equity']}, "
      f"horizon={cfg.forecast_horizon_months}mo, "
      f"window={cfg.window_type}, "
      f"baseline={ew_label}")
    w(f"")
    w(f"**Period:** {bt.index[0].strftime('%Y-%m')} to {bt.index[-1].strftime('%Y-%m')} "
      f"({len(bt)} months / {len(bt)/12:.1f} years)")
    w(f"")

    # ── Performance dashboard ──
    w(f"---")
    w(f"## Performance Dashboard")
    w(f"")
    strats = list(inv_df.index)
    header = "| Metric | " + " | ".join(strats) + " |"
    align = "| :--- | " + " | ".join(["---:" for _ in strats]) + " |"
    w(header)
    w(align)

    metric_rows = [
        ("CAGR",            "cagr",           True),
        ("Total Return",    "total_return",    True),
        ("Volatility",      "volatility",      True),
        ("Sharpe",          "sharpe",          False),
        ("Sortino",         "sortino",         False),
        ("Calmar",          "calmar",          False),
        ("Max Drawdown",    "max_drawdown",    True),
        ("Max DD Duration", "max_dd_duration", False),
        ("VaR (95%)",       "var_95",          True),
        ("CVaR (95%)",      "cvar_95",         True),
        ("Hit Rate",        "hit_rate",        True),
        ("Best Month",      "best_month",      True),
        ("Worst Month",     "worst_month",     True),
        ("Avg Up Month",    "avg_up_month",    True),
        ("Avg Down Month",  "avg_down_month",  True),
        ("Up/Down Ratio",   "up_down_ratio",   False),
        ("Win Streak",      "win_streak",      False),
        ("Lose Streak",     "lose_streak",     False),
    ]

    for label, key, is_pct in metric_rows:
        cells = []
        for s in strats:
            v = inv_df.loc[s, key]
            if key in ("max_dd_duration", "win_streak", "lose_streak"):
                cells.append(f"{int(v)} mo")
            elif is_pct:
                cells.append(_fmt_pct(v))
            else:
                cells.append(_fmt_f(v))
        w(f"| {label} | " + " | ".join(cells) + " |")

    # ── Model vs benchmarks ──
    w(f"")
    w(f"---")
    w(f"## Model vs Benchmarks")
    w(f"")
    model_m = inv_df.loc["Model Portfolio"]
    equity_m = inv_df.loc["Equity Only"]
    ew_m = inv_df.loc[ew_label]

    w(f"### vs Equity Only")
    w(f"| Metric | Value |")
    w(f"| :--- | ---: |")
    w(f"| CAGR gap | {_fmt_pct(model_m['cagr'] - equity_m['cagr'])} ({'trailing' if model_m['cagr'] < equity_m['cagr'] else 'leading'}) |")
    w(f"| Drawdown saved | {_fmt_pct(model_m['max_drawdown'] - equity_m['max_drawdown'])} |")
    w(f"| Sharpe improvement | {_fmt_f(model_m['sharpe'] - equity_m['sharpe'])} |")
    w(f"| Sortino improvement | {_fmt_f(model_m['sortino'] - equity_m['sortino'])} |")
    w(f"| Vol reduction | {_fmt_pct(model_m['volatility'] - equity_m['volatility'])} |")

    w(f"")
    w(f"### vs {ew_label}")
    w(f"| Metric | Value |")
    w(f"| :--- | ---: |")
    w(f"| CAGR gap | {_fmt_pct(model_m['cagr'] - ew_m['cagr'])} |")
    w(f"| Drawdown saved | {_fmt_pct(model_m['max_drawdown'] - ew_m['max_drawdown'])} |")
    w(f"| Sharpe improvement | {_fmt_f(model_m['sharpe'] - ew_m['sharpe'])} |")

    # ── Annual returns ──
    w(f"")
    w(f"---")
    w(f"## Annual Returns")
    w(f"")
    yr_strats = ["Model", ew_label, "60/40", "Equity", "T-Bills", "Model DD"]
    w("| Year | " + " | ".join(yr_strats) + " |")
    w("| :--- | " + " | ".join(["---:" for _ in yr_strats]) + " |")
    for row in annual_data:
        cells = []
        for s in yr_strats:
            cells.append(_fmt_pct(row[s], 1))
        w(f"| {row['year']} | " + " | ".join(cells) + " |")

    # Totals
    total_cells = []
    for s in yr_strats[:-1]:
        total_cells.append(_fmt_pct((1 + bt[{"Model": "port_return", ew_label: "ew_return",
                                              "60/40": "ret_6040", "Equity": "ret_equity",
                                              "T-Bills": "ret_tbills"}[s]]).prod() - 1, 1))
    total_cells.append("—")
    w(f"| **TOTAL** | " + " | ".join(total_cells) + " |")

    model_wins = sum(1 for r in annual_data if r["Model"] > r["Equity"])
    w(f"")
    w(f"Model beat equity in **{model_wins}/{len(annual_data)}** years ({model_wins/len(annual_data):.0%})")

    # ── Direction accuracy ──
    w(f"")
    w(f"---")
    w(f"## Direction Accuracy")
    w(f"")
    w(f"| Metric | Value |")
    w(f"| :--- | ---: |")
    w(f"| Direction accuracy | {_fmt_f(dir_acc, 3)} |")
    w(f"| Magnitude-weighted accuracy | {_fmt_f(weighted_acc, 3)} |")
    w(f"| Upside capture | {_fmt_f(upside_cap, 3)} |")
    w(f"| Downside capture | {_fmt_f(downside_cap, 3)} (lower = better) |")

    # ── Classification ──
    w(f"")
    w(f"## Classification Metrics ({cfg.forecast_horizon_months}-month label)")
    w(f"")
    w(f"| Metric | Value |")
    w(f"| :--- | ---: |")
    w(f"| Accuracy | {_fmt_f(clf_acc, 3)} |")
    w(f"| Balanced Accuracy | {_fmt_f(bal_acc, 3)} |")
    w(f"")
    w(f"**Confusion Matrix:**")
    w(f"")
    cm_cols = list(cm_df.columns)
    w("| | " + " | ".join(f"Pred {c}" for c in cm_cols) + " |")
    w("| :--- | " + " | ".join(["---:" for _ in cm_cols]) + " |")
    for idx in cm_df.index:
        cells = [str(cm_df.loc[idx, c]) for c in cm_cols]
        w(f"| **{idx}** | " + " | ".join(cells) + " |")

    # ── Defensive accuracy ──
    dm = defensive_metrics
    w(f"")
    w(f"---")
    w(f"## Defensive Accuracy")
    w(f"")
    w(f"*Does the model defend when it matters and ride the wave when it should?*")
    w(f"")
    w(f"| Metric | Value | Detail |")
    w(f"| :--- | ---: | :--- |")
    w(f"| Crisis hit rate | {dm['crisis_hit_rate']:.1%} | Went defensive in worst {dm['n_crisis_months']} equity months (bottom 10%) |")
    w(f"| Calm ride rate | {dm['calm_ride_rate']:.1%} | Stayed invested when equity beat T-bills |")
    w(f"| Cost of false defense | {dm['defense_cost']:.2%} | Return given up on {dm['n_false_defense']} false alarms |")
    w(f"| Defense payoff | {dm['defense_payoff']:.2%} | Losses avoided on {dm['n_correct_defense']} correct defensive calls |")
    ratio_str = f"{dm['defense_payoff_ratio']:.2f}x" if dm['defense_payoff_ratio'] != float('inf') else "inf"
    w(f"| Payoff ratio | {ratio_str} | Saved / cost (higher = better) |")

    # ── Weight distribution ──
    w(f"")
    w(f"---")
    w(f"## Weight Distribution")
    w(f"")
    w(f"| Metric | Value |")
    w(f"| :--- | ---: |")
    w(f"| Mean equity weight | {_fmt_pct(eq_w.mean(), 1)} |")
    w(f"| Min | {_fmt_pct(eq_w.min(), 1)} |")
    w(f"| Max | {_fmt_pct(eq_w.max(), 1)} |")
    w(f"| Avg monthly turnover | {_fmt_f(bt['turnover'].mean(), 3)} |")

    buckets = pd.cut(eq_w, bins=[0, 0.3, 0.5, 0.7, 0.85, 1.0],
                     labels=["<30%", "30-50%", "50-70%", "70-85%", ">85%"])
    w(f"")
    w(f"| Bucket | Months | Share |")
    w(f"| :--- | ---: | ---: |")
    for bucket, count in buckets.value_counts().sort_index().items():
        w(f"| {bucket} | {count} | {_fmt_pct(count/len(eq_w), 0)} |")

    # ── Feature importance ──
    w(f"")
    w(f"---")
    w(f"## Feature Importance (Model Coefficients)")
    w(f"")
    w(f"Negative = favors equity, Positive = favors T-bills")
    w(f"")
    w(f"| Feature | Coefficient | Direction |")
    w(f"| :--- | ---: | :--- |")
    if len(coefs) == 1:
        row = coefs.iloc[0].sort_values()
        for feat, val in row.items():
            direction = "-> tbills" if val > 0 else "-> equity"
            w(f"| {feat} | {val:+.3f} | {direction} |")

    # ── Crash overlay ──
    if overlay_stats:
        w(f"")
        w(f"---")
        w(f"## Crash Overlay Stats")
        w(f"")
        w(f"| Metric | Value |")
        w(f"| :--- | ---: |")
        fired = overlay_stats["months_fired"]
        total = overlay_stats["total_months"]
        w(f"| Months fired | {fired}/{total} ({_fmt_pct(fired/total, 1)}) |")
        if fired > 0:
            w(f"| Avg equity weight (active) | {_fmt_pct(overlay_stats['avg_eq_weight_active'], 1)} |")
            w(f"| Avg equity weight (off) | {_fmt_pct(overlay_stats['avg_eq_weight_off'], 1)} |")
            w(f"| Avg return (active) | {_fmt_pct(overlay_stats['avg_ret_active'])} |")
            w(f"| Equity return (active) | {_fmt_pct(overlay_stats['avg_eq_ret_active'])} |")

    # Write file
    os.makedirs(cfg.output_dir, exist_ok=True)
    report_path = os.path.join(cfg.output_dir, "report.md")
    with open(report_path, "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"\n  Report saved to {report_path}")


# ── Evaluation ──────────────────────────────────────────────────────────────

def evaluate(bt: pd.DataFrame, model: RegimeClassifier, cfg: Config) -> dict:
    """Compute and print all evaluation metrics."""

    # Direction accuracy
    valid = bt.dropna(subset=["ret_equity", "ret_tbills"]).copy()
    equity_won = valid["ret_equity"] > valid["ret_tbills"]
    model_favors_equity = valid["weight_equity"] > 0.5
    correct = equity_won == model_favors_equity

    spread = (valid["ret_equity"] - valid["ret_tbills"]).abs()
    weighted_acc = (correct * spread).sum() / spread.sum() if spread.sum() > 0 else 0.5

    excess = valid["ret_equity"] - valid["ret_tbills"]
    port_excess = valid["port_return"] - valid["ret_tbills"]
    up = excess > 0
    upside_capture = port_excess[up].sum() / excess[up].sum() if up.any() else 0
    down = excess < 0
    downside_capture = port_excess[down].sum() / excess[down].sum() if down.any() else 0

    print("\n── Direction Accuracy ──────────────────────────────────────")
    print(f"  Direction accuracy:          {correct.mean():.3f}")
    print(f"  Magnitude-weighted accuracy: {weighted_acc:.3f}")
    print(f"  Upside capture:             {upside_capture:.3f}")
    print(f"  Downside capture:           {downside_capture:.3f} (lower = better)")

    # Classification metrics
    clf_valid = bt.dropna(subset=["pred_class", "actual_label"])
    y_true = clf_valid["actual_label"].astype(int)
    y_pred = clf_valid["pred_class"].astype(int)
    class_names = [cfg.class_labels[i] for i in sorted(cfg.class_labels.keys())]

    acc = accuracy_score(y_true, y_pred)
    bal_acc = balanced_accuracy_score(y_true, y_pred)
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    cm_df = pd.DataFrame(cm, index=class_names, columns=class_names)

    horizon = cfg.forecast_horizon_months
    print(f"\n── Classification Metrics ({horizon}-month label) ─────────────────")
    print(f"  Accuracy:          {acc:.3f}")
    print(f"  Balanced Accuracy: {bal_acc:.3f}")
    print(f"\n  Confusion Matrix:\n{cm_df.to_string(col_space=10)}")
    print(f"\n  Per-class metrics:")
    print(classification_report(y_true, y_pred, target_names=class_names,
                                labels=[0, 1], zero_division=0))

    # Defensive accuracy metrics
    baseline_eq = cfg.equal_weight[0]

    # Crisis hit rate: of the worst 10% months for equity, how often did we go defensive?
    equity_rets = valid["ret_equity"]
    n_crisis = max(1, int(len(equity_rets) * 0.10))
    crisis_threshold = equity_rets.nsmallest(n_crisis).iloc[-1]
    crisis_months = valid[equity_rets <= crisis_threshold]
    went_defensive_in_crisis = (crisis_months["weight_equity"] < baseline_eq).mean()

    # Calm ride rate: of months where equity beat T-bills, how often did we stay at/above baseline?
    calm_months = valid[valid["ret_equity"] > valid["ret_tbills"]]
    stayed_invested = (calm_months["weight_equity"] >= baseline_eq - 0.01).mean() if len(calm_months) > 0 else 0

    # Cost of defense: return given up on false defensive calls
    false_defense = valid[(valid["weight_equity"] < baseline_eq - 0.01) & (valid["ret_equity"] > valid["ret_tbills"])]
    if len(false_defense) > 0:
        # What we returned vs what we would have returned at baseline
        baseline_ret = baseline_eq * false_defense["ret_equity"] + (1 - baseline_eq) * false_defense["ret_tbills"]
        defense_cost = (baseline_ret - false_defense["port_return"]).sum()
    else:
        defense_cost = 0.0

    # Defense payoff: losses avoided on correct defensive calls
    correct_defense = valid[(valid["weight_equity"] < baseline_eq - 0.01) & (valid["ret_equity"] <= valid["ret_tbills"])]
    if len(correct_defense) > 0:
        baseline_ret_cd = baseline_eq * correct_defense["ret_equity"] + (1 - baseline_eq) * correct_defense["ret_tbills"]
        defense_payoff = (correct_defense["port_return"] - baseline_ret_cd).sum()
    else:
        defense_payoff = 0.0

    defense_payoff_ratio = defense_payoff / defense_cost if defense_cost > 0 else float("inf")

    print(f"\n── Defensive Accuracy ─────────────────────────────────────")
    print(f"  Crisis hit rate:       {went_defensive_in_crisis:.1%}  (went defensive in {(crisis_months['weight_equity'] < baseline_eq).sum()}/{len(crisis_months)} worst months)")
    print(f"  Calm ride rate:        {stayed_invested:.1%}  (stayed invested in {int(stayed_invested * len(calm_months))}/{len(calm_months)} up months)")
    print(f"  Cost of false defense: {defense_cost:.2%}  (return given up on {len(false_defense)} false alarms)")
    print(f"  Defense payoff:        {defense_payoff:.2%}  (losses avoided on {len(correct_defense)} correct calls)")
    print(f"  Payoff ratio:          {defense_payoff_ratio:.2f}x  (saved / cost, higher = better)")

    defensive_metrics = {
        "crisis_hit_rate": went_defensive_in_crisis,
        "calm_ride_rate": stayed_invested,
        "defense_cost": defense_cost,
        "defense_payoff": defense_payoff,
        "defense_payoff_ratio": defense_payoff_ratio,
        "n_crisis_months": len(crisis_months),
        "n_false_defense": len(false_defense),
        "n_correct_defense": len(correct_defense),
    }

    # Investment metrics
    ew_label = f"{int(cfg.equal_weight[0]*100)}/{int(cfg.equal_weight[1]*100)}"
    strategies = {
        "Model Portfolio": bt["port_return"],
        ew_label: bt["ew_return"],
        "60/40 Reference": bt["ret_6040"],
        "Equity Only": bt["ret_equity"],
        "T-Bills Only": bt["ret_tbills"],
    }

    inv_results = []
    for name, rets in strategies.items():
        inv_results.append(_investment_metrics(rets, name))
    inv_df = pd.DataFrame(inv_results).set_index("label")

    # ── Performance comparison table ──
    print("╔══════════════════════════════════════════════════════════════════════════════════════════╗")
    print("║                              PERFORMANCE DASHBOARD                                     ║")
    print("╚══════════════════════════════════════════════════════════════════════════════════════════╝")

    strats = list(strategies.keys())
    header = f"  {'':>22s} | {'Model':>10s} | {ew_label:>10s} | {'60/40':>10s} | {'Equity':>10s} | {'T-Bills':>10s}"
    sep = "  " + "─" * len(header.strip())
    print(header)
    print(sep)

    rows = [
        ("CAGR",           "cagr",           ":.2%"),
        ("Total Return",   "total_return",    ":.1%"),
        ("Volatility",     "volatility",      ":.2%"),
        ("Sharpe",         "sharpe",          ":.2f"),
        ("Sortino",        "sortino",         ":.2f"),
        ("Calmar",         "calmar",          ":.2f"),
        ("Max Drawdown",   "max_drawdown",    ":.2%"),
        ("Max DD Duration", "max_dd_duration", ":>3d mths"),
        ("VaR (95%)",      "var_95",          ":.2%"),
        ("CVaR (95%)",     "cvar_95",         ":.2%"),
        ("Hit Rate",       "hit_rate",        ":.1%"),
        ("Best Month",     "best_month",      ":.2%"),
        ("Worst Month",    "worst_month",     ":.2%"),
        ("Avg Up Month",   "avg_up_month",    ":.2%"),
        ("Avg Down Month", "avg_down_month",  ":.2%"),
        ("Up/Down Ratio",  "up_down_ratio",   ":.2f"),
        ("Win Streak",     "win_streak",      ":>3d mths"),
        ("Lose Streak",    "lose_streak",     ":>3d mths"),
    ]

    for row_label, key, fmt in rows:
        vals = []
        for s in strats:
            v = inv_df.loc[s, key]
            if fmt.endswith("mths"):
                cell = f"{int(v):>3d} mths"
            else:
                cell = format(v, fmt.lstrip(":"))
            vals.append(f"{cell:>10s}")
        print(f"  {row_label:>22s} | {' | '.join(vals)}")

    print(sep)
    n_months = inv_df.loc["Model Portfolio", "n_months"]
    n_years = n_months / 12
    print(f"  Period: {bt.index[0].strftime('%Y-%m')} to {bt.index[-1].strftime('%Y-%m')} ({int(n_months)} months / {n_years:.1f} years)")

    model_m = inv_df.loc["Model Portfolio"]
    equity_m = inv_df.loc["Equity Only"]
    print(f"\n  ── Model vs Equity Only ──")
    print(f"  CAGR gap:          {model_m['cagr'] - equity_m['cagr']:+.2%}  ({'trailing' if model_m['cagr'] < equity_m['cagr'] else 'leading'})")
    print(f"  Drawdown saved:    {model_m['max_drawdown'] - equity_m['max_drawdown']:+.2%}")
    print(f"  Sharpe improvement: {model_m['sharpe'] - equity_m['sharpe']:+.2f}")
    print(f"  Sortino improvement: {model_m['sortino'] - equity_m['sortino']:+.2f}")
    print(f"  Vol reduction:     {model_m['volatility'] - equity_m['volatility']:+.2%}")

    print(f"\n  ── Model vs {ew_label} ──")
    ew_m = inv_df.loc[ew_label]
    print(f"  CAGR gap:          {model_m['cagr'] - ew_m['cagr']:+.2%}")
    print(f"  Drawdown saved:    {model_m['max_drawdown'] - ew_m['max_drawdown']:+.2%}")
    print(f"  Sharpe improvement: {model_m['sharpe'] - ew_m['sharpe']:+.2f}")

    # ── Yearly returns table ──
    print(f"\n╔══════════════════════════════════════════════════════════════════════════════════════════╗")
    print(f"║                                ANNUAL RETURNS                                          ║")
    print(f"╚══════════════════════════════════════════════════════════════════════════════════════════╝")

    bt_annual = bt.copy()
    bt_annual["year"] = bt_annual.index.year
    years = sorted(bt_annual["year"].unique())

    yr_header = f"  {'Year':>6s} | {'Model':>10s} | {ew_label:>10s} | {'60/40':>10s} | {'Equity':>10s} | {'T-Bills':>10s} | {'Model DD':>10s}"
    print(yr_header)
    print("  " + "─" * len(yr_header.strip()))

    for year in years:
        mask = bt_annual["year"] == year
        yr_rets = {}
        for col, label in [("port_return", "Model"), ("ew_return", ew_label),
                           ("ret_6040", "60/40"), ("ret_equity", "Equity"), ("ret_tbills", "T-Bills")]:
            yr_rets[label] = (1 + bt_annual.loc[mask, col]).prod() - 1

        # Worst drawdown that year for model
        cum_yr = (1 + bt_annual.loc[mask, "port_return"]).cumprod()
        yr_dd = (cum_yr / cum_yr.cummax() - 1).min()

        vals = [f"{yr_rets[s]:>+10.1%}" for s in ["Model", ew_label, "60/40", "Equity", "T-Bills"]]
        print(f"  {year:>6d} | {' | '.join(vals)} | {yr_dd:>+10.1%}")

    # Print totals
    total_rets = {}
    for col, label in [("port_return", "Model"), ("ew_return", ew_label),
                       ("ret_6040", "60/40"), ("ret_equity", "Equity"), ("ret_tbills", "T-Bills")]:
        total_rets[label] = (1 + bt[col]).prod() - 1
    vals = [f"{total_rets[s]:>+10.1%}" for s in ["Model", ew_label, "60/40", "Equity", "T-Bills"]]
    print("  " + "─" * len(yr_header.strip()))
    print(f"  {'TOTAL':>6s} | {' | '.join(vals)} |")

    # Count years model beat equity
    model_wins = sum(1 for y in years
                     if ((1 + bt_annual.loc[bt_annual["year"] == y, "port_return"]).prod() - 1) >
                        ((1 + bt_annual.loc[bt_annual["year"] == y, "ret_equity"]).prod() - 1))
    print(f"\n  Model beat equity in {model_wins}/{len(years)} years ({model_wins/len(years):.0%})")

    # Weight distribution
    eq_w = bt["weight_equity"]
    print(f"\n── Weight Distribution ─────────────────────────────────────")
    print(f"  Mean equity weight:  {eq_w.mean():.1%}")
    print(f"  Min / Max:           {eq_w.min():.1%} / {eq_w.max():.1%}")
    buckets = pd.cut(eq_w, bins=[0, 0.3, 0.5, 0.7, 0.85, 1.0],
                     labels=["<30%", "30-50%", "50-70%", "70-85%", ">85%"])
    for bucket, count in buckets.value_counts().sort_index().items():
        print(f"    {bucket:>8s}: {count:3d} months ({count/len(eq_w):.0%})")

    # Feature importance
    coefs = model.get_coefficients()
    print("\n── Feature Importance (Model Coefficients) ─────────────────")
    if len(coefs) == 1:
        row = coefs.iloc[0].sort_values()
        print("  Negative = favors equity, Positive = favors T-bills:")
        for feat, val in row.items():
            print(f"    {feat:>30s}: {val:+.3f}  {'-> tbills' if val > 0 else '-> equity'}")
    else:
        print(coefs.round(3).to_string())

    print(f"\n  Average Monthly Turnover: {bt['turnover'].mean():.3f}")

    # Crash overlay stats
    if "overlay" in bt.columns:
        active = bt["overlay"] != "none"
        n_active = active.sum()
        print(f"\n── Crash Overlay Stats ─────────────────────────────────────")
        print(f"  Months overlay fired: {n_active}/{len(bt)} ({n_active/len(bt):.1%})")
        if n_active > 0:
            print(f"  Avg equity weight (overlay active): {bt.loc[active, 'weight_equity'].mean():.1%}")
            print(f"  Avg equity weight (overlay off):    {bt.loc[~active, 'weight_equity'].mean():.1%}")
            print(f"  Avg monthly return (overlay active): {bt.loc[active, 'port_return'].mean():.2%} "
                  f"(equity was {bt.loc[active, 'ret_equity'].mean():.2%})")

    # Save summary
    os.makedirs(cfg.output_dir, exist_ok=True)
    inv_df.to_csv(os.path.join(cfg.output_dir, "investment_metrics.csv"))

    # Build annual returns data for the report
    bt_annual = bt.copy()
    bt_annual["year"] = bt_annual.index.year
    years = sorted(bt_annual["year"].unique())
    annual_data = []
    for year in years:
        mask = bt_annual["year"] == year
        row = {"year": year}
        for col, label in [("port_return", "Model"), ("ew_return", ew_label),
                           ("ret_6040", "60/40"), ("ret_equity", "Equity"), ("ret_tbills", "T-Bills")]:
            row[label] = (1 + bt_annual.loc[mask, col]).prod() - 1
        cum_yr = (1 + bt_annual.loc[mask, "port_return"]).cumprod()
        row["Model DD"] = (cum_yr / cum_yr.cummax() - 1).min()
        annual_data.append(row)

    # Crash overlay data
    overlay_stats = {}
    if "overlay" in bt.columns:
        active = bt["overlay"] != "none"
        overlay_stats["months_fired"] = int(active.sum())
        overlay_stats["total_months"] = len(bt)
        if active.sum() > 0:
            overlay_stats["avg_eq_weight_active"] = bt.loc[active, "weight_equity"].mean()
            overlay_stats["avg_eq_weight_off"] = bt.loc[~active, "weight_equity"].mean()
            overlay_stats["avg_ret_active"] = bt.loc[active, "port_return"].mean()
            overlay_stats["avg_eq_ret_active"] = bt.loc[active, "ret_equity"].mean()

    _save_report(bt, inv_df, annual_data, coefs, eq_w, overlay_stats, cfg,
                 correct.mean(), weighted_acc, upside_capture, downside_capture,
                 acc, bal_acc, cm_df, ew_label, defensive_metrics)

    return {"classification": {"confusion_matrix": cm_df},
            "investment": inv_df, "coefficients": coefs}


# ── Plots ───────────────────────────────────────────────────────────────────

def _ew_label(cfg):
    return f"{int(cfg.equal_weight[0]*100)}/{int(cfg.equal_weight[1]*100)}"


def _save(fig, cfg, name):
    fig.tight_layout()
    fig.savefig(os.path.join(cfg.plot_dir, name), dpi=150)
    plt.close(fig)
    print(f"  Saved {name}")


def generate_all_plots(bt: pd.DataFrame, eval_results: dict, cfg: Config):
    os.makedirs(cfg.plot_dir, exist_ok=True)
    print("\nGenerating plots...")
    ew_label = _ew_label(cfg)

    # Cumulative returns
    fig, ax = plt.subplots(figsize=(12, 6))
    ax.plot(bt.index, bt["cum_port"], label="Model Portfolio", linewidth=2)
    ax.plot(bt.index, bt["cum_ew"], label=ew_label, linewidth=1.5, linestyle="--", alpha=0.8)
    ax.plot(bt.index, bt["cum_6040"], label="60/40 Reference",
            linewidth=1.5, linestyle="-.", alpha=0.7, color="purple")
    ax.plot(bt.index, bt["cum_equity"], label="Equity Only (SPY)",
            linewidth=1, linestyle="--", alpha=0.6)
    ax.plot(bt.index, bt["cum_tbills"], label="T-Bills Only",
            linewidth=1, linestyle="--", alpha=0.6)
    ax.set_title("Cumulative Returns: Model vs Benchmarks")
    ax.set_ylabel("Growth of $100")
    ax.legend(loc="upper left")
    ax.grid(True, alpha=0.3)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    _save(fig, cfg, "cumulative_returns.png")

    # Drawdowns
    fig, ax = plt.subplots(figsize=(12, 4))
    for col, label in [("port_return", "Model"), ("ew_return", ew_label),
                        ("ret_6040", "60/40 Reference"), ("ret_equity", "Equity Only (SPY)")]:
        cum = (1 + bt[col]).cumprod()
        ax.fill_between(bt.index, cum / cum.cummax() - 1, 0, alpha=0.25, label=label)
    ax.set_title("Drawdowns")
    ax.set_ylabel("Drawdown")
    ax.legend()
    ax.grid(True, alpha=0.3)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    _save(fig, cfg, "drawdowns.png")

    # Equity weight over time (step plot for instantaneous changes)
    fig, ax = plt.subplots(figsize=(12, 5))
    ax.fill_between(bt.index, bt["weight_equity"], 0, alpha=0.4, color="#2196F3",
                    label="Equity weight", step="post")
    ax.fill_between(bt.index, bt["weight_equity"], 1, alpha=0.4, color="#4CAF50",
                    label="T-Bills weight", step="post")
    ax.axhline(0.5, color="gray", linestyle="--", alpha=0.5, label="50/50")
    ax.axhline(0.6, color="orange", linestyle=":", alpha=0.5, label="60/40")
    ax.set_title("Portfolio Equity Weight Over Time")
    ax.set_ylabel("Equity Weight")
    ax.set_ylim(0, 1)
    ax.legend(loc="lower left", bbox_to_anchor=(0.0, 1.02), ncol=4, fontsize="small",
              frameon=True, borderaxespad=0)
    ax.grid(True, alpha=0.3)
    ax.xaxis.set_major_locator(mdates.YearLocator())
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    ax.xaxis.set_minor_locator(mdates.MonthLocator(bymonth=[1, 4, 7, 10]))
    ax.tick_params(axis="x", which="minor", length=4)
    ax.tick_params(axis="x", which="major", length=7)
    fig.subplots_adjust(top=0.88)
    _save(fig, cfg, "equity_weight_over_time.png")

    # Predicted probabilities
    fig, ax = plt.subplots(figsize=(12, 5))
    ax.plot(bt.index, bt["prob_equity"], label="P(Equity beats T-bills)", color="#2196F3", alpha=0.8)
    ax.plot(bt.index, bt["prob_tbills"], label="P(T-Bills win)", color="#4CAF50", alpha=0.8)
    ax.axhline(0.5, color="gray", linestyle="--", alpha=0.5)
    ax.set_title("Predicted Probabilities Over Time")
    ax.set_ylabel("Probability")
    ax.set_ylim(0, 1)
    ax.legend()
    ax.grid(True, alpha=0.3)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    _save(fig, cfg, "probabilities_over_time.png")

    # Rolling Sharpe
    fig, ax = plt.subplots(figsize=(12, 5))
    window = 24
    for col, label in [("port_return", "Model"), ("ew_return", ew_label),
                        ("ret_6040", "60/40 Reference"), ("ret_equity", "Equity Only (SPY)")]:
        rm = bt[col].rolling(window).mean() * 12
        rs = bt[col].rolling(window).std() * np.sqrt(12)
        ax.plot(bt.index, rm / rs, label=label, alpha=0.8)
    ax.axhline(0, color="gray", linestyle="-", alpha=0.3)
    ax.set_title(f"Rolling {window}-Month Sharpe Ratio")
    ax.set_ylabel("Sharpe Ratio")
    ax.legend()
    ax.grid(True, alpha=0.3)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    _save(fig, cfg, "rolling_sharpe.png")

    # Confusion matrix
    if "classification" in eval_results:
        cm = eval_results["classification"]["confusion_matrix"]
        fig, ax = plt.subplots(figsize=(5, 4))
        im = ax.imshow(cm.values, cmap="Blues", aspect="auto")
        ax.set_xticks(range(len(cm.columns)))
        ax.set_yticks(range(len(cm.index)))
        ax.set_xticklabels(cm.columns)
        ax.set_yticklabels(cm.index)
        ax.set_xlabel("Predicted")
        ax.set_ylabel("Actual")
        ax.set_title("Confusion Matrix")
        for i in range(len(cm.index)):
            for j in range(len(cm.columns)):
                val = cm.values[i, j]
                color = "white" if val > cm.values.max() * 0.6 else "black"
                ax.text(j, i, str(val), ha="center", va="center", color=color, fontsize=16)
        fig.colorbar(im)
        _save(fig, cfg, "confusion_matrix.png")

    # Feature coefficients
    if "coefficients" in eval_results:
        coefs = eval_results["coefficients"]
        fig, ax = plt.subplots(figsize=(10, 6))
        if len(coefs) == 1:
            vals = coefs.iloc[0].sort_values()
            colors = ["#2196F3" if v < 0 else "#4CAF50" for v in vals]
            ax.barh(range(len(vals)), vals, color=colors, alpha=0.8)
            ax.set_yticks(range(len(vals)))
            ax.set_yticklabels(vals.index, fontsize=9)
            ax.axvline(0, color="black", linewidth=0.5)
            ax.set_xlabel("Coefficient (negative = equity, positive = T-bills)")
            ax.set_title("What Pushes Toward Equities vs T-Bills")
        else:
            im = ax.imshow(coefs.values, cmap="RdBu_r", aspect="auto",
                           vmin=-np.abs(coefs.values).max(), vmax=np.abs(coefs.values).max())
            ax.set_xticks(range(len(coefs.columns)))
            ax.set_yticks(range(len(coefs.index)))
            ax.set_xticklabels(coefs.columns, rotation=45, ha="right", fontsize=9)
            ax.set_yticklabels(coefs.index)
            fig.colorbar(im)
        _save(fig, cfg, "coefficients.png")

    print("  All plots saved.")
