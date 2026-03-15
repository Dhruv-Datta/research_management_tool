"""Fetch current quotes for a list of tickers using yfinance."""
import json
import sys
import yfinance as yf

def _safe_float(val):
    try:
        if val is None:
            return None
        v = float(val)
        return v if v == v else None  # NaN check
    except (TypeError, ValueError):
        return None


def fetch_quotes(tickers):
    result = {}
    for t in tickers:
        try:
            tk = yf.Ticker(t)
            info = tk.fast_info
            price = float(info.last_price) if hasattr(info, 'last_price') and info.last_price else None
            prev = float(info.previous_close) if hasattr(info, 'previous_close') and info.previous_close else None
            if price is None:
                # fallback to history
                hist = tk.history(period="2d")
                if not hist.empty:
                    price = float(hist['Close'].iloc[-1])
                    if len(hist) >= 2:
                        prev = float(hist['Close'].iloc[-2])
            day_change = (price - prev) if (price and prev) else 0
            day_change_pct = ((day_change / prev) * 100) if prev else 0

            # Pull extended info for richer metrics
            full_info = {}
            try:
                full_info = tk.info or {}
            except Exception:
                pass

            market_cap = _safe_float(info.market_cap) if hasattr(info, 'market_cap') else _safe_float(full_info.get('marketCap'))
            enterprise_value = _safe_float(full_info.get('enterpriseValue'))
            ev_to_ebitda = _safe_float(full_info.get('enterpriseToEbitda'))
            avg_volume = _safe_float(full_info.get('averageVolume'))
            dividend_yield = _safe_float(full_info.get('dividendYield'))
            trailing_pe = _safe_float(full_info.get('trailingPE'))
            revenue_growth = _safe_float(full_info.get('revenueGrowth'))
            earnings_growth = _safe_float(full_info.get('earningsGrowth'))
            roic = _safe_float(full_info.get('returnOnCapital')) or _safe_float(full_info.get('returnOnEquity'))
            fifty_two_high = _safe_float(full_info.get('fiftyTwoWeekHigh'))
            fifty_two_low = _safe_float(full_info.get('fiftyTwoWeekLow'))
            short_name = full_info.get('shortName') or full_info.get('longName') or ''

            result[t] = {
                "shortName": short_name,
                "price": price,
                "previousClose": prev,
                "dayChange": round(day_change, 4),
                "dayChangePct": round(day_change_pct, 4),
                "marketCap": market_cap,
                "enterpriseValue": enterprise_value,
                "evToEbitda": ev_to_ebitda,
                "avgVolume": avg_volume,
                "dividendYield": dividend_yield,
                "trailingPE": trailing_pe,
                "revenueGrowth": revenue_growth,
                "earningsGrowth": earnings_growth,
                "roic": roic,
                "fiftyTwoWeekHigh": fifty_two_high,
                "fiftyTwoWeekLow": fifty_two_low,
            }
        except Exception as e:
            result[t] = {"price": None, "error": str(e)}
    return result

if __name__ == "__main__":
    tickers = sys.argv[1:]
    if not tickers:
        print(json.dumps({}))
    else:
        print(json.dumps(fetch_quotes(tickers)))
