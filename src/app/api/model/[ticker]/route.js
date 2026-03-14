import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

function modelPath(ticker) {
  return path.join(DATA_DIR, ticker.toUpperCase(), 'valuation_model.json');
}

export async function GET(request, { params }) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();
  const filePath = modelPath(upper);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ ticker: upper, exists: false });
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return NextResponse.json({ ticker: upper, exists: true, inputs: data.inputs });
  } catch {
    return NextResponse.json({ ticker: upper, exists: false });
  }
}

export async function POST(request, { params }) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();
  const filePath = modelPath(upper);
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    const body = await request.json();
    const payload = {
      inputs: body.inputs,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    return NextResponse.json({ success: true, ticker: upper });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
