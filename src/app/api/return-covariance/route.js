import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });

// GET /api/return-covariance?tickers=AAPL,GOOGL&days=252
// Returns { matrix: [[...], ...], tickers: ['AAPL', 'GOOGL'], vols: { AAPL: 0.32, ... } }
// Matrix is the annualized return covariance matrix (sample covariance * 252).
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers');
    const days = Math.min(Number(searchParams.get('days')) || 252, 504);

    if (!tickersParam) {
      return NextResponse.json({ error: 'tickers param required' }, { status: 400 });
    }

    const tickers = tickersParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days + 60)); // buffer for alignment

    // Fetch daily closes for each ticker
    const closesMap = {};
    await Promise.all(tickers.map(async (t) => {
      try {
        const chart = await yahooFinance.chart(t, {
          period1: start.toISOString().split('T')[0],
          period2: end.toISOString().split('T')[0],
        });
        const quotes = chart.quotes || [];
        // Store as [{ date, close }] for alignment
        const series = quotes
          .filter(q => q.close != null && q.date != null)
          .map(q => ({ date: new Date(q.date).toISOString().split('T')[0], close: q.close }));
        if (series.length >= 20) {
          closesMap[t] = series;
        }
      } catch (err) {
        console.warn(`return-covariance: failed to fetch ${t}:`, err.message || err);
      }
    }));

    const validTickers = tickers.filter(t => closesMap[t]);
    if (validTickers.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 valid tickers' }, { status: 400 });
    }

    // Build a common date index (intersection of all tickers' dates)
    const dateSets = validTickers.map(t => new Set(closesMap[t].map(d => d.date)));
    let commonDates = [...dateSets[0]];
    for (let i = 1; i < dateSets.length; i++) {
      commonDates = commonDates.filter(d => dateSets[i].has(d));
    }
    commonDates.sort();

    // Use last `days` common dates
    if (commonDates.length > days + 1) {
      commonDates = commonDates.slice(-(days + 1));
    }

    if (commonDates.length < 21) {
      return NextResponse.json({ error: 'Not enough common trading days' }, { status: 400 });
    }

    // Build aligned close price arrays
    const n = validTickers.length;
    const priceArrays = validTickers.map(t => {
      const lookup = Object.fromEntries(closesMap[t].map(d => [d.date, d.close]));
      return commonDates.map(d => lookup[d]);
    });

    // Compute daily returns (T-1 returns from T dates)
    const T = commonDates.length - 1;
    const returns = priceArrays.map(prices => {
      const r = [];
      for (let t = 1; t < prices.length; t++) {
        r.push((prices[t] - prices[t - 1]) / prices[t - 1]);
      }
      return r;
    });

    // Compute means
    const means = returns.map(r => r.reduce((s, v) => s + v, 0) / T);

    // Compute sample covariance matrix (Bessel-corrected), then annualize
    const matrix = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        let cov = 0;
        for (let t = 0; t < T; t++) {
          cov += (returns[i][t] - means[i]) * (returns[j][t] - means[j]);
        }
        cov = (cov / (T - 1)) * 252; // annualize
        matrix[i][j] = cov;
        matrix[j][i] = cov;
      }
    }

    // Also return annualized vols for convenience
    const vols = {};
    validTickers.forEach((t, i) => {
      vols[t] = Math.sqrt(matrix[i][i]);
    });

    return NextResponse.json({ matrix, tickers: validTickers, vols });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
