import { NextResponse } from 'next/server';
import { loadPortfolio } from '@/lib/portfolio';

export async function GET() {
  try {
    const portfolio = await loadPortfolio();
    return NextResponse.json(portfolio);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
