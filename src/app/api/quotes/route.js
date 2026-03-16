import { NextResponse } from 'next/server';
import { fetchQuotes } from '@/lib/yahoo';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const tickers = searchParams.get('tickers');
    if (!tickers) {
      return NextResponse.json({ error: 'tickers param required' }, { status: 400 });
    }

    const tickerList = tickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
    const quotes = await fetchQuotes(tickerList);

    return NextResponse.json({ quotes });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
