import { NextResponse } from 'next/server';
import { loadWatchlist, saveWatchlist } from '@/lib/watchlist';

export async function GET() {
  try {
    const data = await loadWatchlist();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    await saveWatchlist(body);
    return NextResponse.json({ success: true, ...body });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
