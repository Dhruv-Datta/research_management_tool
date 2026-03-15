"""Fetch price change % over a given period for a list of tickers."""
import json
import sys
import yfinance as yf

PERIOD_MAP = {
    "1d": "5d",      # need a few days to get previous close
    "1mo": "1mo",
    "3mo": "3mo",
    "6mo": "6mo",
    "1y": "1y",
    "2y": "2y",
    "5y": "5y",
}


def fetch_changes(tickers, period):
    result = {}
    yf_period = PERIOD_MAP.get(period)
    if not yf_period:
        return result

    for t in tickers:
        try:
            tk = yf.Ticker(t)
            if period == "1d":
                info = tk.fast_info
                price = float(info.last_price) if hasattr(info, 'last_price') and info.last_price else None
                prev = float(info.previous_close) if hasattr(info, 'previous_close') and info.previous_close else None
                if price and prev:
                    change = ((price - prev) / prev) * 100
                    result[t] = round(change, 4)
                else:
                    result[t] = 0
            else:
                hist = tk.history(period=yf_period)
                if hist.empty or len(hist) < 2:
                    result[t] = 0
                    continue
                start_price = float(hist['Close'].iloc[0])
                end_price = float(hist['Close'].iloc[-1])
                if start_price > 0:
                    change = ((end_price - start_price) / start_price) * 100
                    result[t] = round(change, 4)
                else:
                    result[t] = 0
        except Exception:
            result[t] = 0
    return result


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({}))
    else:
        period = sys.argv[1]
        tickers = sys.argv[2:]
        print(json.dumps(fetch_changes(tickers, period)))
