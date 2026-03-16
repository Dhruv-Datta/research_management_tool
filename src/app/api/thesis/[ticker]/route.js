import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

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
  const upper = ticker.toUpperCase();

  const { data, error } = await supabase
    .from('theses')
    .select('*')
    .eq('ticker', upper)
    .single();

  if (error || !data) {
    return NextResponse.json({ ticker: upper, ...DEFAULT_THESIS });
  }

  return NextResponse.json({
    ticker: upper,
    ...DEFAULT_THESIS,
    coreReasons: data.core_reasons || DEFAULT_THESIS.coreReasons,
    assumptions: data.assumptions || '',
    valuation: data.valuation || '',
    underwriting: { ...DEFAULT_THESIS.underwriting, ...(data.underwriting || {}) },
    newsUpdates: data.news_updates || [],
    todos: data.todos || [],
  });
}

export async function POST(request, { params }) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();

  try {
    const body = await request.json();
    const row = {
      ticker: upper,
      core_reasons: body.coreReasons || DEFAULT_THESIS.coreReasons,
      assumptions: body.assumptions || '',
      valuation: body.valuation || '',
      underwriting: { ...DEFAULT_THESIS.underwriting, ...(body.underwriting || {}) },
      news_updates: body.newsUpdates || [],
      todos: body.todos || [],
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('theses').upsert(row);
    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      ticker: upper,
      coreReasons: row.core_reasons,
      assumptions: row.assumptions,
      valuation: row.valuation,
      underwriting: row.underwriting,
      newsUpdates: row.news_updates,
      todos: row.todos,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
