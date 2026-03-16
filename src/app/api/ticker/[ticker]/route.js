import { NextResponse } from 'next/server';
import { tickerDataExists, loadTickerFundamentals, computeValuationMetrics } from '@/lib/tickerData';

export async function GET(request, { params }) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();

  const exists = await tickerDataExists(upper);

  if (!exists) {
    return NextResponse.json({
      ticker: upper,
      dataExists: false,
      message: `No data found for ${upper}. Generate data using Alpha Vantage API.`,
    });
  }

  const data = await loadTickerFundamentals(upper);
  const valuation = computeValuationMetrics(data);

  return NextResponse.json({
    ticker: upper,
    dataExists: true,
    ...data,
    valuation,
  });
}
