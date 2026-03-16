import { NextResponse } from 'next/server';
import { fetchPeriodChanges } from '@/lib/yahoo';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const tickers = searchParams.get('tickers');
    const period = searchParams.get('period') || '1d';

    if (!tickers) {
      return NextResponse.json({ error: 'tickers param required' }, { status: 400 });
    }

    const allowed = ['1d', '1mo', '3mo', '6mo', '1y', '2y', '5y'];
    if (!allowed.includes(period)) {
      return NextResponse.json({ error: 'invalid period' }, { status: 400 });
    }

    const tickerList = tickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
    const changes = await fetchPeriodChanges(tickerList, period);

    return NextResponse.json({ changes });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
