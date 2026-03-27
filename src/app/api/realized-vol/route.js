import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });

// GET /api/realized-vol?tickers=AAPL,GOOGL&days=252
// Returns { vols: { AAPL: 0.32, GOOGL: 0.28 } } (annualized)
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
    start.setDate(start.getDate() - (days + 30)); // extra buffer for alignment

    const vols = {};

    await Promise.all(tickers.map(async (t) => {
      try {
        const chart = await yahooFinance.chart(t, {
          period1: start.toISOString().split('T')[0],
          period2: end.toISOString().split('T')[0],
        });
        const closes = (chart.quotes || []).map(q => q.close).filter(c => c != null);
        if (closes.length < 20) return;

        // Daily returns
        const returns = [];
        for (let i = 1; i < closes.length; i++) {
          returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
        }

        // Use last `days` returns
        const r = returns.slice(-days);
        const mean = r.reduce((s, v) => s + v, 0) / r.length;
        const variance = r.reduce((s, v) => s + (v - mean) ** 2, 0) / r.length;
        vols[t] = Math.sqrt(variance) * Math.sqrt(252); // annualized
      } catch {
        // skip ticker on error
      }
    }));

    return NextResponse.json({ vols });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
