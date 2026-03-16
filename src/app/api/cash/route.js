import { NextResponse } from 'next/server';
import { updateCash } from '@/lib/portfolio';

export async function POST(request) {
  try {
    const body = await request.json();
    const { cash } = body;

    if (cash == null || isNaN(Number(cash))) {
      return NextResponse.json({ error: 'cash must be a number' }, { status: 400 });
    }

    const portfolio = await updateCash(Number(cash));
    return NextResponse.json({ success: true, portfolio });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
