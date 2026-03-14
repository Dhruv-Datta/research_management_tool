"""Generate data/ CSVs for a ticker using Alpha Vantage (fundamentals) and yfinance (prices)."""

from __future__ import annotations

import argparse
import os
import time
import json
from pathlib import Path
from typing import Optional
from urllib.request import urlopen
from urllib.error import HTTPError, URLError

import pandas as pd

try:
    import yfinance as yf
except Exception as exc:
    raise RuntimeError("yfinance is required: pip install yfinance") from exc

ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query"


def _ensure_dirs(base_dir: Path):
    fundamentals_dir = base_dir / "fundamentals"
    price_dir = base_dir / "price_data"
    for d in (fundamentals_dir, price_dir):
        d.mkdir(parents=True, exist_ok=True)
    return fundamentals_dir, price_dir


def _quarter_label(dt: pd.Timestamp) -> str:
    quarter = ((dt.month - 1) // 3) + 1
    return f"Q{quarter}"


def _quarter_frame(series: pd.Series, value_name: str) -> pd.DataFrame:
    df = pd.DataFrame({value_name: series.values}, index=series.index)
    df["year"] = df.index.year
    df["quarter"] = df.index.map(_quarter_label)
    return df[["year", "quarter", value_name]]


def _ttm_sum(series: pd.Series) -> pd.Series:
    return series.sort_index().rolling(4).sum()


def _ttm_mean(series: pd.Series) -> pd.Series:
    return series.sort_index().rolling(4).mean()


def _fetch_alpha_vantage(function: str, symbol: str, api_key: str) -> dict:
    url = f"{ALPHA_VANTAGE_BASE_URL}?function={function}&symbol={symbol}&apikey={api_key}"
    try:
        with urlopen(url, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError) as e:
        raise RuntimeError(f"Alpha Vantage API request failed: {e}") from e

    if "Error Message" in data:
        raise RuntimeError(f"Alpha Vantage API error: {data['Error Message']}")
    if "Note" in data:
        raise RuntimeError(f"Alpha Vantage rate limit: {data['Note']}")
    if "Information" in data:
        raise RuntimeError(f"Alpha Vantage: {data['Information']}")
    return data


def _parse_quarterly_reports(data: dict, report_key: str = "quarterlyReports") -> pd.DataFrame:
    reports = data.get(report_key, [])
    if not reports:
        return pd.DataFrame()
    df = pd.DataFrame(reports)
    if "fiscalDateEnding" not in df.columns:
        return pd.DataFrame()
    df["fiscalDateEnding"] = pd.to_datetime(df["fiscalDateEnding"])
    df = df.set_index("fiscalDateEnding").sort_index()
    for col in df.columns:
        if col != "reportedCurrency":
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def _parse_annual_reports(data: dict) -> pd.DataFrame:
    reports = data.get("annualReports", [])
    if not reports:
        return pd.DataFrame()
    df = pd.DataFrame(reports)
    if "fiscalDateEnding" not in df.columns:
        return pd.DataFrame()
    df["fiscalDateEnding"] = pd.to_datetime(df["fiscalDateEnding"])
    df = df.set_index("fiscalDateEnding").sort_index()
    for col in df.columns:
        if col != "reportedCurrency":
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def _pick_series(df: pd.DataFrame, names: list[str]) -> Optional[pd.Series]:
    if df.empty:
        return None
    for name in names:
        if name in df.columns:
            series = df[name].astype("float64")
            if not series.isna().all():
                return series
    return None


def generate_data(ticker: str, data_dir: Path, api_key: Optional[str] = None):
    if api_key is None:
        api_key = os.environ.get("ALPHA_VANTAGE_API_KEY")
    if not api_key:
        raise RuntimeError("Alpha Vantage API key required.")

    base_dir = data_dir / ticker.upper()
    fundamentals_dir, price_dir = _ensure_dirs(base_dir)

    # Prices from yfinance - fetch maximum available history
    print(f"Fetching price data for {ticker}...")
    price = yf.download(ticker, period="max",
                        auto_adjust=False, progress=False, group_by="column")
    if price.empty:
        raise RuntimeError(f"No price data for {ticker}")
    if isinstance(price.columns, pd.MultiIndex):
        price.columns = [c[0] if c[0] else c[1] for c in price.columns]
    price = price.reset_index()
    price.columns = [str(c).lower().replace(" ", "_") for c in price.columns]
    price = price.rename(columns={"adj_close": "adjusted_close"})
    if "date" not in price.columns and "datetime" in price.columns:
        price = price.rename(columns={"datetime": "date"})
    if "close" not in price.columns:
        close_candidates = [c for c in price.columns if "close" in c and c != "adjusted_close"]
        if close_candidates:
            price = price.rename(columns={close_candidates[0]: "close"})
    price["date"] = pd.to_datetime(price["date"]).dt.strftime("%Y-%m-%d")
    price[["date", "close"]].to_csv(price_dir / "daily_prices.csv", index=False)
    print(f"  Saved {len(price)} days of price data")

    # Market data metrics
    price_numeric = price.copy()
    price_numeric["date"] = pd.to_datetime(price_numeric["date"])
    price_numeric = price_numeric.sort_values("date")
    current_price = float(price_numeric.iloc[-1]["close"])
    current_date = price_numeric.iloc[-1]["date"].strftime("%Y-%m-%d")
    last_year_prices = price_numeric.tail(252)
    week_52_high = float(last_year_prices["close"].max())
    week_52_low = float(last_year_prices["close"].min())
    pct_from_high = ((current_price - week_52_high) / week_52_high) * 100

    market_rows = [
        {"metric": "current_price", "value": current_price, "date": current_date},
        {"metric": "52_week_high", "value": week_52_high, "date": current_date},
        {"metric": "52_week_low", "value": week_52_low, "date": current_date},
        {"metric": "pct_from_52week_high", "value": round(pct_from_high, 2), "date": current_date},
    ]
    if len(price_numeric) >= 252:
        price_1y_ago = float(price_numeric.iloc[-252]["close"])
        pct_1y = ((current_price - price_1y_ago) / price_1y_ago) * 100
        market_rows.append({"metric": "pct_change_1y", "value": round(pct_1y, 2), "date": current_date})
    pd.DataFrame(market_rows).to_csv(price_dir / "market_data.csv", index=False)
    print(f"  Saved market data")

    # Fundamentals from Alpha Vantage - save ALL available data
    print(f"Fetching fundamentals from Alpha Vantage...")
    print("  Fetching income statement...")
    income_raw = _fetch_alpha_vantage("INCOME_STATEMENT", ticker, api_key)
    income_q = _parse_quarterly_reports(income_raw)
    income_a = _parse_annual_reports(income_raw)
    time.sleep(12)
    print("  Fetching balance sheet...")
    balance_raw = _fetch_alpha_vantage("BALANCE_SHEET", ticker, api_key)
    balance_q = _parse_quarterly_reports(balance_raw)
    balance_a = _parse_annual_reports(balance_raw)
    time.sleep(12)
    print("  Fetching cash flow statement...")
    cash_raw = _fetch_alpha_vantage("CASH_FLOW", ticker, api_key)
    cash_q = _parse_quarterly_reports(cash_raw)
    cash_a = _parse_annual_reports(cash_raw)

    # Merge quarterly + annual data to maximize history
    # Annual reports go further back; convert to quarterly-like by placing at fiscal date
    def _merge_q_a(q_series, a_series):
        """Extend quarterly series with annual data for dates not covered by quarterly."""
        if q_series is None and a_series is None:
            return None
        if q_series is None:
            return a_series
        if a_series is None:
            return q_series
        # Only keep annual entries that predate the earliest quarterly entry
        earliest_q = q_series.index.min()
        a_before = a_series[a_series.index < earliest_q]
        if a_before.empty:
            return q_series
        return pd.concat([a_before, q_series]).sort_index()

    revenue_q = _pick_series(income_q, ["totalRevenue"])
    revenue_a = _pick_series(income_a, ["totalRevenue"])
    operating_income_q = _pick_series(income_q, ["operatingIncome"])
    operating_income_a = _pick_series(income_a, ["operatingIncome"])
    net_income_q = _pick_series(income_q, ["netIncome", "netIncomeFromContinuingOperations"])
    shares_out_q = _pick_series(balance_q, ["commonStockSharesOutstanding", "commonStock"])
    shares_out_a = _pick_series(balance_a, ["commonStockSharesOutstanding", "commonStock"])
    eps_q = _pick_series(income_q, ["dilutedEPS", "reportedEPS"])
    eps_a = _pick_series(income_a, ["dilutedEPS", "reportedEPS"])

    if eps_q is None:
        diluted_shares = _pick_series(income_q, ["dilutedAverageShares", "dilutedAverageSharesOutstanding"])
        if net_income_q is not None and diluted_shares is not None:
            eps_q = net_income_q / diluted_shares
        elif net_income_q is not None and shares_out_q is not None:
            eps_q = net_income_q / shares_out_q

    fcf_q = _pick_series(cash_q, ["freeCashFlow"])
    if fcf_q is None:
        op_cf = _pick_series(cash_q, ["operatingCashflow"])
        capex = _pick_series(cash_q, ["capitalExpenditures"])
        if op_cf is not None and capex is not None:
            fcf_q = op_cf - capex

    fcf_a = _pick_series(cash_a, ["freeCashFlow"])
    if fcf_a is None:
        op_cf_a = _pick_series(cash_a, ["operatingCashflow"])
        capex_a = _pick_series(cash_a, ["capitalExpenditures"])
        if op_cf_a is not None and capex_a is not None:
            fcf_a = op_cf_a - capex_a

    # For quarterly TTM data, use all available quarterly reports (no tail limit)
    revenue = revenue_q
    if revenue is not None:
        ttm = _ttm_sum(revenue).dropna()
        if not ttm.empty:
            _quarter_frame(ttm, "revenue").to_csv(fundamentals_dir / "revenue.csv", index=False)
            print(f"  Saved {len(ttm)} quarters of revenue")

    operating_income = operating_income_q
    if operating_income is not None and revenue is not None:
        ttm_op = _ttm_sum(operating_income)
        ttm_rev = _ttm_sum(revenue)
        margin = (ttm_op / ttm_rev).dropna()
        if not margin.empty:
            _quarter_frame(margin, "operating_margin").to_csv(fundamentals_dir / "operating_margins.csv", index=False)
            print(f"  Saved {len(margin)} quarters of margins")

    shares_out = shares_out_q
    if shares_out is not None:
        shares_ttm = _ttm_mean(shares_out).dropna()
        if not shares_ttm.empty:
            _quarter_frame(shares_ttm, "shares_outstanding").to_csv(fundamentals_dir / "buybacks.csv", index=False)
            print(f"  Saved {len(shares_ttm)} quarters of shares")

    eps = eps_q
    if eps is not None:
        eps_ttm = _ttm_sum(eps).dropna()
        if not eps_ttm.empty:
            _quarter_frame(eps_ttm, "eps_diluted").to_csv(fundamentals_dir / "eps.csv", index=False)
            print(f"  Saved {len(eps_ttm)} quarters of EPS")

    fcf = fcf_q
    if fcf is not None:
        fcf_ttm = _ttm_sum(fcf).dropna()
        if not fcf_ttm.empty:
            _quarter_frame(fcf_ttm, "free_cash_flow").to_csv(fundamentals_dir / "fcf.csv", index=False)
            print(f"  Saved {len(fcf_ttm)} quarters of FCF")

    print(f"\nDone generating data for {ticker.upper()}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--ticker", "-t", required=True)
    parser.add_argument("--data-dir", default="data")
    parser.add_argument("--api-key", default=None)
    args = parser.parse_args()
    generate_data(args.ticker, Path(args.data_dir), api_key=args.api_key)
