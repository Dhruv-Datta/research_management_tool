import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

function thesisPath(ticker) {
  return path.join(DATA_DIR, ticker.toUpperCase(), 'thesis.json');
}

const DEFAULT_THESIS = {
  coreReasons: [{ title: '', description: '' }, { title: '', description: '' }, { title: '', description: '' }],
  assumptions: '',
  valuation: '',
  underwriting: {
    revenueCAGR: '',
    operatingMargin: '',
    buybackRate: '',
    exitPE: '',
    exitFCFYield: '',
    terminalGrowthRate: '',
  },
  newsUpdates: [],
  todos: [],
};

export async function GET(request, { params }) {
  const { ticker } = await params;
  const filePath = thesisPath(ticker);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ ticker: ticker.toUpperCase(), ...DEFAULT_THESIS });
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return NextResponse.json({ ticker: ticker.toUpperCase(), ...DEFAULT_THESIS, ...data });
  } catch {
    return NextResponse.json({ ticker: ticker.toUpperCase(), ...DEFAULT_THESIS });
  }
}

export async function POST(request, { params }) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();
  const filePath = thesisPath(upper);
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    const body = await request.json();
    const data = {
      coreReasons: body.coreReasons || DEFAULT_THESIS.coreReasons,
      assumptions: body.assumptions || '',
      valuation: body.valuation || '',
      underwriting: { ...DEFAULT_THESIS.underwriting, ...(body.underwriting || {}) },
      newsUpdates: body.newsUpdates || [],
      todos: body.todos || [],
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return NextResponse.json({ success: true, ticker: upper, ...data });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
